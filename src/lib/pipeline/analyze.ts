import { evaluateForAd, pickupOnlyKm } from "@/lib/rules/apply";
import { prepareAutoMessage } from "@/lib/rules/automsg";
import type { Verdict } from "@/lib/rules/verdict";
import { sharedNotifyUserIds } from "../notify/shared";
import { allowsPurchase, purchasePolicy, validDriveSeconds } from "../radar/driving";
import { purchaseStatus } from "../radar/safety";
import { inCityScope } from "../radar/locality";
import type { Prisma } from "@prisma/client";
import { createProvider, type AiProvider } from "../ai/provider";
import { enrichWithAi } from "../ai/extract";
import type { AppConfig } from "../config/schema";
import { prisma } from "../db/client";
import { recognize, type ManualOverrides } from "../engines/recognition";
import { assessRisk } from "../engines/risk";
import { bandFor, scoreDeal } from "../engines/scoring";
import {
  calcProfit,
  costsFromConfig,
  maxBuyPrice,
  minSalePrice,
  taxFromConfig,
} from "../engines/profit";
import { valuate } from "../engines/valuation";
import { batteryOutcome, distanceCosts } from "../engines/policy";
import { assessSeller } from "../engines/seller";
import { evaluate, type FilterContext } from "../engines/filters";
import { enqueue } from "../jobs/queue";
import { errMsg, log } from "../log";
import { getConfig, getSecret } from "../settings/store";
import type { Recognition, RiskFlag, Signal } from "../types";
import { loadTree } from "./tree";
import {
  getPrefs,
  passesPrefs,
  quietEndsAt,
  type NotifyPrefs,
} from "../notify/prefs";

async function createNotification(o: {
  adId: string;
  profileId: string;
  userId: string;
  channel: "TELEGRAM" | "DISCORD" | "WEBPUSH";
  dedupeKey: string;
  runAt?: Date;
  priority?: number;
}) {
  if (
    await prisma.notification.findUnique({ where: { dedupeKey: o.dedupeKey } })
  )
    return;
  try {
    // Outbox en job samen committen: een crash ertussen mag geen melding laten stranden.
    if (
      o.channel === "WEBPUSH" &&
      (await prisma.notification.findUnique({
        where: { dedupeKey: `${o.dedupeKey}:p` },
      }))
    )
      return;
    await prisma.$transaction(async (tx) => {
      const n = await tx.notification.create({
        data: {
          adId: o.adId,
          profileId: o.profileId,
          userId: o.userId,
          channel: o.channel,
          dedupeKey: o.dedupeKey,
        },
      });
      await tx.backgroundJob.create({
        data: {
          type: "NOTIFY",
          payload: { notificationId: n.id },
          priority: o.priority ?? 30,
          runAt: o.runAt ?? new Date(),
          uniqueKey: `notify:${n.id}`,
          maxAttempts: 6,
        },
      });
    });
  } catch (e) {
    // gelijktijdige analyse maakte dezelfde melding al aan (unieke dedupeKey): niets te doen
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
}

export interface AdOverrides {
  recognition?: ManualOverrides;
  costs?: {
    repairCents?: number;
    shippingCents?: number;
    transportCents?: number;
    otherCents?: number;
    marginSchemeEligible?: boolean;
  };
}

const BAND_RANK = {
  NOT_INTERESTING: 0,
  MODERATE: 1,
  INTERESTING: 2,
  VERY_INTERESTING: 3,
  TOP: 4,
} as const;

export function repairCostFor(signals: Signal[], cfg: AppConfig): number {
  const codes = new Set(signals.map((s) => s.code));
  let c = 0;
  if (codes.has("SCREEN_DAMAGE")) c += cfg.repairCostsCents.screen;
  if (codes.has("BACK_DAMAGE")) c += cfg.repairCostsCents.back;
  if (codes.has("CAMERA_DAMAGE")) c += cfg.repairCostsCents.camera;
  return c;
}

export interface AnalyzeDeps {
  provider?: AiProvider | null;
  cfg?: AppConfig;
  quick?: boolean;
}

export async function analyzeAd(
  adId: string,
  deps: AnalyzeDeps = {},
): Promise<{ score: number; blocked: boolean } | null> {
  const cfg = deps.cfg ?? (await getConfig());
  const ad = await prisma.advertisement.findUnique({
    where: { id: adId },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!ad) return null;
  const overrides = (ad.overrides ?? {}) as AdOverrides;

  // 1) Productherkenning: regels -> AI alleen indien nodig
  const attrs =
    (ad.rawPayload as { attributes?: Record<string, string | number> } | null)
      ?.attributes ?? null;
  let rec: Recognition = recognize(
    { title: ad.title, description: ad.description, structured: attrs },
    overrides.recognition,
  );
  let provider = deps.provider;
  if (deps.quick) provider = null;
  if (provider === undefined)
    provider = createProvider(cfg, await getSecret("ai.apiKey"));
  const ai = await enrichWithAi(
    rec,
    {
      title: ad.title,
      description: ad.description,
      imageUrls: ad.images.map((i) => i.url),
    },
    cfg,
    provider ?? null,
  );
  rec = ai.rec;
  if (ai.visibleDamage?.length) {
    const map: Record<string, Signal["code"]> = {
      screen: "SCREEN_DAMAGE",
      back: "BACK_DAMAGE",
      camera: "CAMERA_DAMAGE",
      frame: "COSMETIC_DAMAGE",
    };
    for (const d of ai.visibleDamage) {
      const code = map[d];
      if (code && !rec.signals.some((s) => s.code === code))
        rec.signals.push({
          code,
          evidence: "zichtbaar op foto (AI-inschatting)",
        });
    }
  }

  const storageGb =
    typeof rec.facts.storageGb?.value === "number"
      ? rec.facts.storageGb.value
      : null;
  const ramGb =
    typeof rec.facts.ramGb?.value === "number" ? rec.facts.ramGb.value : null;
  const battery =
    typeof rec.facts.batteryHealth?.value === "number"
      ? rec.facts.batteryHealth.value
      : null;

  // 2) Productrecord + specificaties bewaren (afgeleid; bron blijft onaangeroerd)
  const product = await prisma.appleProduct.upsert({
    where: { adId },
    create: {
      adId,
      family: rec.family,
      modelKey: rec.modelKey,
      modelLabel: rec.modelLabel,
      recognizedBy: rec.recognizedBy,
      confidence: rec.confidence,
      conditionGrade: rec.conditionGrade,
    },
    update: {
      family: rec.family,
      modelKey: rec.modelKey,
      modelLabel: rec.modelLabel,
      recognizedBy: rec.recognizedBy,
      confidence: rec.confidence,
      conditionGrade: rec.conditionGrade,
    },
  });
  await prisma.productSpecification.deleteMany({
    where: { productId: product.id },
  });
  const specRows = Object.entries(rec.facts).map(([key, f]) => ({
    productId: product.id,
    key,
    value: String(f.value),
    source: f.source,
    evidence: f.evidence ?? null,
  }));
  for (const u of rec.unknown)
    if (!rec.facts[u])
      specRows.push({
        productId: product.id,
        key: u,
        value: "onbekend",
        source: "UNKNOWN",
        evidence: null,
      });
  if (specRows.length)
    await prisma.productSpecification.createMany({ data: specRows });

  // 3) Voorlopig risico (voor opname in vergelijkingsset) en eigen marktdata-bijdrage
  const photoCount = ad.images.length;
  const pre = assessRisk({
    recognition: rec,
    photoCount,
    descriptionLength: ad.description.length,
    askingCents: ad.askingPriceCents,
  });
  const hasDamage = rec.signals.some((s) =>
    [
      "SCREEN_DAMAGE",
      "BACK_DAMAGE",
      "CAMERA_DAMAGE",
      "SEVERE_DEFECT",
      "WATER_DAMAGE",
      "FOR_PARTS",
      "NON_ORIGINAL_PARTS",
    ].includes(s.code),
  );
  const comparableOk =
    !ad.duplicateOfId &&
    !pre.blocked &&
    !hasDamage &&
    rec.family !== "unknown" &&
    rec.confidence >= 0.6 &&
    (ad.askingPriceCents ?? 0) > 0;
  const existingComp = await prisma.marketComparable.findFirst({
    where: { sourceAdId: adId },
  });
  if (comparableOk) {
    const compData = {
      modelKey: rec.modelKey,
      storageGb,
      ramGb,
      variantKey: "",
      priceCents: ad.askingPriceCents!,
      kind: "ASKING_CURRENT" as const,
      batteryHealth: battery,
      conditionGrade: rec.conditionGrade,
      source: ad.source,
      sourceUrl: ad.url,
      sourceAdId: adId,
      isDemo: ad.isDemo,
      observedAt: new Date(),
    };
    if (existingComp)
      await prisma.marketComparable.update({
        where: { id: existingComp.id },
        data: compData,
      });
    else await prisma.marketComparable.create({ data: compData });
  } else if (existingComp) {
    await prisma.marketComparable.delete({ where: { id: existingComp.id } });
  }

  // 4) Waardering
  const comps = await prisma.marketComparable.findMany({
    where: { modelKey: rec.modelKey, isDemo: ad.isDemo },
    orderBy: { observedAt: "desc" },
    take: 500,
  });
  const bat = batteryOutcome(rec.family, battery, cfg);
  const shippingList = (ad.shippingOptions as string[]) ?? [];
  const dist = distanceCosts(ad.distanceKm, shippingList, cfg, validDriveSeconds(ad), ad.driveMeters);
  const repairCents =
    overrides.costs?.repairCents ??
    repairCostFor(rec.signals, cfg) + bat.replacementCents;
  const val0 = valuate(
    {
      modelKey: rec.modelKey,
      storageGb,
      ramGb,
      batteryHealth: battery,
      conditionGrade: rec.conditionGrade,
      willBeRepaired:
        repairCents > 0 && (overrides.costs?.repairCents ?? 1) > 0,
      excludeSourceAdId: adId,
    },
    comps.map((c) => ({
      modelKey: c.modelKey,
      priceCents: c.priceCents,
      kind: c.kind,
      storageGb: c.storageGb,
      ramGb: c.ramGb,
      batteryHealth: c.batteryHealth,
      observedAt: c.observedAt,
      sourceAdId: c.sourceAdId,
    })),
    cfg,
  );
  const val =
    bat.priceFactor === 1
      ? val0
      : {
          ...val0,
          lowCents: Math.round(val0.lowCents * bat.priceFactor),
          expectedCents: Math.round(val0.expectedCents * bat.priceFactor),
          highCents: Math.round(val0.highCents * bat.priceFactor),
        };

  // 5) Risico (definitief) en winst
  const policyFlags: RiskFlag[] = [];
  const policyReview: string[] = [];
  if (bat.exclude)
    policyFlags.push({
      code: "BATTERY_POLICY",
      label: bat.notes[0] ?? "Batterijbeleid sluit deze advertentie uit",
      severity: "block",
      points: 100,
    });
  if (bat.review) {
    policyFlags.push({
      code: "BATTERY_UNKNOWN",
      label: "Batterijconditie onbekend (apart beoordelen)",
      severity: "warn",
      points: 8,
    });
    policyReview.push("Batterijconditie onbekend");
  }
  const risk = assessRisk({
    recognition: rec,
    photoCount,
    descriptionLength: ad.description.length,
    askingCents: ad.askingPriceCents,
    expectedCents: val.expectedCents,
    valuationConfidence: val.confidence,
    policyFlags,
    policyReviewReasons: policyReview,
  });
  const costs = costsFromConfig(cfg, {
    repairCents,
    shippingCents:
      overrides.costs?.shippingCents ?? dist.shippingCents ?? undefined,
    transportCents:
      overrides.costs?.transportCents ?? dist.transportCents ?? undefined,
    otherCents: overrides.costs?.otherCents,
  });
  const seller = assessSeller({
    verified: ad.sellerVerified,
    business:
      (ad.sellerSignals as { business?: boolean | null })?.business ?? null,
    anonymous:
      (ad.sellerSignals as { anonymous?: boolean | null })?.anonymous ?? null,
    rating: (ad.sellerSignals as { rating?: number | null })?.rating ?? null,
    reviewCount:
      (ad.sellerSignals as { reviewCount?: number | null })?.reviewCount ??
      null,
    accountAgeMonths:
      (ad.sellerSignals as { accountAgeMonths?: number | null })
        ?.accountAgeMonths ?? null,
    photoCount,
    descriptionLength: ad.description.length,
    askingCents: ad.askingPriceCents,
    expectedCents: val.expectedCents,
    valuationConfidence: val.confidence,
    riskFlags: risk.flags,
    shipping: shippingList,
  });
  const tax = taxFromConfig(cfg, overrides.costs?.marginSchemeEligible);
  const buy = ad.askingPriceCents ?? 0;
  const priceKnown = ad.askingPriceCents != null && ad.askingPriceCents > 0;
  const pExp = calcProfit(buy, val.expectedCents, costs, tax);
  const pLow = calcProfit(buy, val.lowCents, costs, tax);
  const pHigh = calcProfit(buy, val.highCents, costs, tax);
  const maxBid =
    val.expectedCents > 0
      ? maxBuyPrice(
          val.expectedCents,
          costs,
          tax,
          cfg.targets.minProfitCents,
          cfg.targets.minRoiPct,
        )
      : 0;
  const maxBidCons =
    val.lowCents > 0
      ? maxBuyPrice(
          val.lowCents,
          costs,
          tax,
          cfg.targets.minProfitCents,
          cfg.targets.minRoiPct,
        )
      : 0;
  const minSale = priceKnown
    ? minSalePrice(buy, costs, tax, cfg.targets.minProfitCents)
    : 0;

  const signals = ad.sellerSignals as {
    rating?: number;
    reviewCount?: number;
    accountAgeMonths?: number;
  } | null;
  const procurement = purchaseStatus(
    {
      distanceKm: ad.distanceKm,
      driveSeconds: validDriveSeconds(ad),
      shipping: shippingList.includes("shipping"),
      rating: signals?.rating,
      reviews: signals?.reviewCount,
      ageMonths: signals?.accountAgeMonths,
      blocked: risk.blocked,
      suspicious:
        risk.level === "HIGH" ||
        risk.flags.some((f) => f.severity === "high" || f.severity === "block"),
    },
    purchasePolicy(cfg),
  );
  const needsReview =
    risk.needsManualReview || !priceKnown || procurement.key === "review";
  const knownRatio = rec.unknown.length
    ? 1 -
      rec.unknown.length / (rec.unknown.length + Object.keys(rec.facts).length)
    : 1;
  const sc = scoreDeal(
    {
      roiPct: pExp.roiPct,
      netProfitCents: pExp.netProfitCents,
      conservativeProfitCents: pLow.netProfitCents,
      valuationConfidence: val.confidence,
      valuationUncertain: val.uncertain,
      sampleSize: val.sampleSize,
      conditionGrade: rec.conditionGrade,
      batteryHealth: battery,
      knownFactRatio: knownRatio,
      family: rec.family,
      riskScore: risk.score,
      blocked: risk.blocked,
      priceUnknown: !priceKnown,
      needsManualReview: needsReview,
      activationUnverified: risk.flags.some(
        (f) => f.code === "ACTIVATION_UNVERIFIED",
      ),
      recognitionConfidence: rec.confidence,
    },
    cfg,
  );
  let explanation = sc.explanation;
  if (!priceKnown)
    explanation =
      "Geen vaste vraagprijs bekend (bieden/op aanvraag): winst en score kunnen niet worden bepaald. " +
      explanation;
  if (risk.blocked)
    explanation +=
      " Blokkades: " +
      risk.flags
        .filter((f) => f.severity === "block")
        .map((f) => f.label)
        .join("; ") +
      ".";
  if (val.uncertain)
    explanation +=
      " Let op: de marktwaarde is onzeker (te weinig of te wisselende vergelijkingsdata); behandel de winstverwachting niet als zeker.";

  // 5b) Inkoopregels Best Buy Phone (alleen als er een basisprijs is; anders blijft de bestaande waardering leidend)
  let rulesVerdict: (Verdict & { textPrices?: { ask: number | null; bid: number | null } | null; replaceDistancePolicy?: boolean }) | null = null;
  try {
    const r = await evaluateForAd({ ad, rec, shipping: shippingList });
    rulesVerdict = { ...r.verdict, textPrices: r.textPrices, replaceDistancePolicy: r.cfg.replaceDistancePolicy };
  } catch (e) {
    log("error", "Inkoopregels mislukt", { adId, error: errMsg(e) });
  }

  // 6) Opslaan
  await prisma.$transaction(async (tx) => {
    await tx.dealAnalysis.updateMany({
      where: { adId, isCurrent: true },
      data: { isCurrent: false },
    });
    await tx.dealAnalysis.create({
      data: {
        adId,
        askingCents: buy,
        lowCents: val.lowCents,
        expectedCents: val.expectedCents,
        highCents: val.highCents,
        valuationConfidence: val.confidence,
        sampleSize: val.sampleSize,
        uncertain: val.uncertain,
        costs: {
          expected: pExp,
          conservative: pLow,
          optimistic: pHigh,
          valuationSteps: val.steps,
          repairCents,
          maxBidConservativeCents: maxBidCons,
          distance: dist,
          battery: bat,
          seller,
          procurement,
          rules: rulesVerdict,
        } as unknown as Prisma.InputJsonValue,
        netProfitCents: pExp.netProfitCents,
        conservativeProfitCents: pLow.netProfitCents,
        optimisticProfitCents: pHigh.netProfitCents,
        grossMarginPct: pExp.grossMarginPct,
        netMarginPct: pExp.netMarginPct,
        roiPct: pExp.roiPct,
        minSalePriceCents: minSale,
        maxBidCents: maxBid,
        score: sc.score,
        band: sc.band,
        scoreBreakdown: {
          factors: sc.factors,
          adjustments: sc.adjustments,
          rawScore: sc.rawScore,
        } as unknown as Prisma.InputJsonValue,
        explanation,
        blocked: sc.blocked,
        settingsSnapshot: {
          targets: cfg.targets,
          costs: cfg.costs,
          tax: cfg.tax,
          weights: cfg.scoring.weights,
          valuation: cfg.valuation,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.riskAssessment.upsert({
      where: { adId },
      create: {
        adId,
        level: risk.level,
        score: risk.score,
        flags: risk.flags as unknown as Prisma.InputJsonValue,
        blocked: risk.blocked,
        needsManualReview: needsReview,
      },
      update: {
        level: risk.level,
        score: risk.score,
        flags: risk.flags as unknown as Prisma.InputJsonValue,
        blocked: risk.blocked,
        needsManualReview: needsReview,
      },
    });
    const last = await tx.valuationHistory.findFirst({
      where: { adId },
      orderBy: { computedAt: "desc" },
    });
    if (
      !last ||
      last.expectedCents !== val.expectedCents ||
      last.sampleSize !== val.sampleSize
    ) {
      await tx.valuationHistory.create({
        data: {
          adId,
          modelKey: rec.modelKey,
          lowCents: val.lowCents,
          expectedCents: val.expectedCents,
          highCents: val.highCents,
          confidence: val.confidence,
          sampleSize: val.sampleSize,
          realizedUsed: val.realizedUsed,
          uncertain: val.uncertain,
          methodology: {
            steps: val.steps,
            tier: val.tier,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
    await tx.advertisement.update({
      where: { id: adId },
      data: {
        status: "ANALYZED",
        statusError: null,
        needsManualReview: needsReview,
        lastCheckedOkAt: new Date(),
        analyzedAt: deps.quick ? undefined : new Date(),
      },
    });
  });

  // 7) Zoekprofielen matchen en meldingen klaarzetten
  if (!ad.duplicateOfId) {
    const ctx: FilterContext = {
      modelKey: rec.modelKey,
      family: rec.family,
      modelLabel: rec.modelLabel,
      storageGb,
      ramGb,
      batteryHealth: battery,
      valuationCertain: !val.uncertain,
      expectedValueCents: val.expectedCents,
      askingCents: ad.askingPriceCents,
      expectedProfitCents: priceKnown ? pExp.netProfitCents : null,
      roiPct: priceKnown ? pExp.roiPct : null,
      maxBidCents: maxBid,
      distanceKm: ad.distanceKm,
      driveSeconds: validDriveSeconds(ad),
      ageHours: ad.publishedAt
        ? (Date.now() - ad.publishedAt.getTime()) / 3600_000
        : (Date.now() - ad.firstSeenAt.getTime()) / 3600_000,
      text: `${ad.title} ${ad.description}`.toLowerCase(),
      photoCount,
      descriptionLength: ad.description.length,
      shipping: (ad.shippingOptions as string[]) ?? [],
      condition: rec.conditionGrade,
      hasDefect: rec.signals.some((s) =>
        [
          "SCREEN_DAMAGE",
          "BACK_DAMAGE",
          "CAMERA_DAMAGE",
          "SEVERE_DEFECT",
          "WATER_DAMAGE",
          "FOR_PARTS",
        ].includes(s.code),
      ),
      activationLock:
        (rec.facts.activationLock?.value as "locked" | "clear" | undefined) ??
        null,
      mdm: rec.signals.some((s) => s.code === "MDM"),
      score: sc.score,
      riskScore: risk.score,
      riskLevel: risk.level,
      blocked: risk.blocked,
      location: ad.location,
      sellerTrust: seller.level === "UNKNOWN" ? null : seller.score,
      sellerTrustLevel: seller.level,
      sellerVerified: ad.sellerVerified ?? null,
      sellerRating:
        (ad.sellerSignals as { rating?: number | null })?.rating ?? null,
      sellerReviewCount:
        (ad.sellerSignals as { reviewCount?: number | null })?.reviewCount ??
        null,
      sellerAgeMonths:
        (ad.sellerSignals as { accountAgeMonths?: number | null })
          ?.accountAgeMonths ?? null,
      shippingAvailable: shippingList.includes("shipping"),
      pickupAvailable: shippingList.includes("pickup") || !shippingList.length,
      batteryKnown: battery != null,
      purchaseProof: rec.signals.some((s) => s.code === "NO_PURCHASE_PROOF")
        ? "no"
        : /aankoopbewijs|factuur|bon\b|kassabon|aankoopbon/i.test(
              `${ad.title} ${ad.description}`,
            )
          ? "yes"
          : null,
    };
    await matchProfiles(
      adId,
      ctx,
      {
        band: sc.band,
        score: sc.score,
        blocked: risk.blocked,
        isDemo: ad.isDemo,
        userIgnored: ad.userState === "IGNORED",
        netProfitCents: pExp.netProfitCents,
        firstSeenAt: ad.firstSeenAt,
        publishedAt: ad.publishedAt,
        origin: ad.origin,
        rules: rulesVerdict ? { status: rulesVerdict.status, replaceDistancePolicy: rulesVerdict.replaceDistancePolicy !== false } : null,
        source: ad.source,
        modelKey: rec.modelKey,
        marginEuro: rulesVerdict?.profit?.profitEuro ?? null,
        pickupOnlyKm: await pickupOnlyKm(),
        complete:
          !["SEARCH", "PARTNER_API"].includes(ad.origin) ||
          Boolean(ad.detailFetchedAt) ||
          Boolean(
            (ad.rawPayload as { detailFailed?: boolean } | null)?.detailFailed,
          ),
      },
      cfg,
    );
  }
  try {
    await prepareAutoMessage({ id: ad.id, title: ad.title, url: ad.url, sellerId: ad.sellerId, sellerName: ad.sellerName, isDemo: ad.isDemo }, rulesVerdict?.status ?? null);
  } catch (e) {
    log("warn", "Auto-bericht voorbereiden mislukt", { adId, error: errMsg(e) });
  }
  return { score: sc.score, blocked: sc.blocked };
}

export async function matchProfiles(
  adId: string,
  ctx: FilterContext,
  meta: {
    band: keyof typeof BAND_RANK;
    score: number;
    blocked: boolean;
    isDemo: boolean;
    userIgnored: boolean;
    netProfitCents: number;
    /** wanneer de advertentie voor het eerst is gezien en (grof) is geplaatst */ firstSeenAt: Date;
    publishedAt: Date | null;
    origin: string;
    /** volledige advertentie beoordeeld (detailpagina) */ complete: boolean;
    /** alleen ophalen binnen zoveel km hemelsbreed (verzending uit); null = geen beperking */
    pickupOnlyKm?: number | null;
    /** oordeel van de inkoopregels; "skip" of null = bestaande logica */
    rules?: { status: string; replaceDistancePolicy: boolean } | null;
    source?: string;
    modelKey?: string;
    marginEuro?: number | null;
  },
  cfg: AppConfig,
) {
  const profiles = await prisma.searchProfile.findMany({
    where: { active: true },
  });
  const prefsCache = new Map<string, { prefs: NotifyPrefs; push: boolean }>();
  const shared = await sharedNotifyUserIds();
  for (const p of profiles) {
    try {
      const tree = await loadTree(p.id);
      const rulesOn = Boolean(meta.rules && meta.rules.status !== "skip");
      // Vinted geeft geen locatie: daar geldt heel Nederland en dus geen stads-/rijtijd-/afstandsbeleid
      const bypassPolicy = meta.source === "vinted" || (rulesOn && meta.rules!.replaceDistancePolicy);
      const tooFar = meta.pickupOnlyKm != null && ctx.distanceKm != null && ctx.distanceKm > meta.pickupOnlyKm;
      const matched = !tooFar && (bypassPolicy || (inCityScope(ctx.location, cfg.radar.cityOnly) && allowsPurchase({
        distanceKm: ctx.distanceKm, driveSeconds: ctx.driveSeconds, shipping: ctx.shippingAvailable,
        rating: ctx.sellerRating, reviews: ctx.sellerReviewCount, ageMonths: ctx.sellerAgeMonths,
        blocked: ctx.blocked, suspicious: ctx.riskLevel === "HIGH" || ctx.riskLevel === "BLOCKED",
      }, cfg))) && evaluate(tree, ctx);
      await prisma.profileMatch.upsert({
        where: { profileId_adId: { profileId: p.id, adId } },
        create: { profileId: p.id, adId, matched },
        update: { matched },
      });
      const [discovered, interesting] = await Promise.all([
        prisma.profileMatch.count({
          where: {
            profileId: p.id,
            matched: true,
            ad: { duplicateOfId: null },
          },
        }),
        prisma.profileMatch.count({
          where: {
            profileId: p.id,
            matched: true,
            ad: {
              duplicateOfId: null,
              analyses: {
                some: {
                  isCurrent: true,
                  blocked: false,
                  score: { gte: cfg.targets.minDealScore },
                },
              },
            },
          },
        }),
      ]);
      await prisma.searchProfile.update({
        where: { id: p.id },
        data: { discoveredCount: discovered, interestingCount: interesting },
      });

      // Meldingen: pas na volledige beoordeling (detailpagina) en nooit voor geblokkeerde/genegeerde/demo-advertenties
      // Alleen echt nieuwe advertenties melden: niet wat bij de nulmeting van het profiel al bestond, en geen oude advertentie die we pas nu tegenkomen
      const baselineAt = (p.sourceConfig as { baselineAt?: string } | null)
        ?.baselineAt;
      const mailOnly =
        (p.sourceConfig as { mailOnly?: boolean } | null)?.mailOnly === true;
      // "Alleen via mailbox": uitsluitend advertenties die via een Marktplaats-alert binnenkwamen (die zijn per definitie nieuw)
      const isNew = mailOnly
        ? meta.origin === "MANUAL_URL"
        : p.sourceKind !== "SEARCH" ||
          (baselineAt
            ? meta.firstSeenAt > new Date(baselineAt)
            : p.lastSuccessAt != null);
      const fresh =
        !meta.publishedAt ||
        meta.publishedAt.getTime() > Date.now() - 30 * 3600_000;
      const base =
        isNew &&
        fresh &&
        matched &&
        p.notifyEnabled &&
        cfg.notifications.enabled &&
        !meta.blocked &&
        !meta.userIgnored &&
        !meta.isDemo &&
        (rulesOn ? meta.rules!.status !== "reject" : meta.score >= p.notifyMinScore);
      // Snelle modus: direct een voorlopige push op basis van de lijstgegevens; de definitieve volgt na de detailpagina
      // Vinted-profielen sturen altijd direct een voorlopige push op basis van de lijstgegevens (zoals de snelle modus bij Marktplaats)
      const fastProfile =
        ((p.sourceConfig as { platform?: string } | null)?.platform === "vinted" && meta.source === "vinted") ||
        (cfg.scheduler.fast.enabled &&
          (p.sourceConfig as { fastMode?: boolean } | null)?.fastMode === true);
      const complete = meta.complete || !cfg.notifications.requireFullAnalysis;
      const eligible = base && (complete || fastProfile);
      if (eligible) {
        let prefs = prefsCache.get(p.userId);
        if (!prefs) {
          prefs = {
            prefs: await getPrefs(p.userId),
            push:
              (await prisma.pushSubscription.count({
                where: { userId: p.userId, enabled: true },
              })) > 0,
          };
          prefsCache.set(p.userId, prefs);
        }
        const runAt = quietEndsAt(prefs.prefs) ?? undefined;
        const floor = BAND_RANK[cfg.notifications.minBand];
        // Telegram/Discord: zoals per zoekprofiel ingesteld, tenzij de gebruiker Telegram uit zet of alleen als alternatief wil
        const skipChat =
          prefs.prefs.telegram === "off" ||
          (prefs.prefs.telegram === "fallback" && prefs.push);
        if (complete && !skipChat && BAND_RANK[meta.band] >= floor) {
          const channels = (p.notifyChannels as string[]).filter((c) =>
            (cfg.notifications.channels as string[]).includes(c),
          );
          for (const ch of channels)
            await createNotification({
              adId,
              profileId: p.id,
              userId: p.userId,
              channel: ch as "TELEGRAM" | "DISCORD",
              dedupeKey: `${ch}:${adId}:${p.id}`,
              runAt,
            });
        }
        // Pop-up en Web Push: één per gebruiker per advertentie, voor de eigenaar van het profiel én voor accounts die de radar meekijken (zie Instellingen → Gebruikers)
        for (const uid of [p.userId, ...shared.filter((x) => x !== p.userId)]) {
          let up = prefsCache.get(uid);
          if (!up) {
            up = {
              prefs: await getPrefs(uid),
              push: (await prisma.pushSubscription.count({ where: { userId: uid, enabled: true } })) > 0,
            };
            prefsCache.set(uid, up);
          }
          const facts = { score: meta.score, band: meta.band, netProfitCents: meta.netProfitCents, profileId: p.id, source: meta.source, modelKey: meta.modelKey, marginEuro: meta.marginEuro ?? null };
          const capped = up.prefs.maxPerHour != null && (await prisma.notification.count({ where: { userId: uid, channel: "WEBPUSH", createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= up.prefs.maxPerHour;
          const userRunAt = quietEndsAt(up.prefs) ?? undefined;
          if (up.prefs.popup && passesPrefs(up.prefs, facts).ok) {
            const key = `INAPP:${adId}:${uid}`;
            if (!(await prisma.notification.findUnique({ where: { dedupeKey: key } }))) {
              try {
                await prisma.notification.create({ data: { adId, profileId: p.id, userId: uid, channel: "INAPP", dedupeKey: key, status: "SENT", sentAt: new Date() } });
              } catch (e) {
                if ((e as { code?: string }).code !== "P2002") throw e;
              }
            }
          }
          if (up.push && up.prefs.push && !capped && passesPrefs(up.prefs, facts).ok) {
            await createNotification({ adId, profileId: p.id, userId: uid, channel: "WEBPUSH", dedupeKey: `WEBPUSH:${adId}:${uid}`, runAt: userRunAt, priority: complete ? 30 : 40 });
          }
        }
      }
    } catch (e) {
      log("error", "Profielmatch mislukt", {
        profileId: p.id,
        adId,
        error: errMsg(e),
      });
    }
  }
}
