import type { Prisma } from "@prisma/client";
import { createProvider, type AiProvider } from "../ai/provider";
import { enrichWithAi } from "../ai/extract";
import type { AppConfig } from "../config/schema";
import { prisma } from "../db/client";
import { recognize, type ManualOverrides } from "../engines/recognition";
import { assessRisk } from "../engines/risk";
import { bandFor, scoreDeal } from "../engines/scoring";
import { calcProfit, costsFromConfig, maxBuyPrice, minSalePrice, taxFromConfig } from "../engines/profit";
import { valuate } from "../engines/valuation";
import { batteryOutcome, distanceCosts } from "../engines/policy";
import { assessSeller } from "../engines/seller";
import { evaluate, type FilterContext } from "../engines/filters";
import { enqueue } from "../jobs/queue";
import { errMsg, log } from "../log";
import { getConfig, getSecret } from "../settings/store";
import type { Recognition, RiskFlag, Signal } from "../types";
import { loadTree } from "./tree";
import { getPrefs, passesPrefs, quietEndsAt, type NotifyPrefs } from "../notify/prefs";

async function createNotification(o: { adId: string; profileId: string; userId: string; channel: "TELEGRAM" | "DISCORD" | "WEBPUSH"; dedupeKey: string; runAt?: Date }) {
  if (await prisma.notification.findUnique({ where: { dedupeKey: o.dedupeKey } })) return;
  try {
    const n = await prisma.notification.create({ data: { adId: o.adId, profileId: o.profileId, userId: o.userId, channel: o.channel, dedupeKey: o.dedupeKey } });
    await enqueue({ type: "NOTIFY", payload: { notificationId: n.id }, priority: 30, runAt: o.runAt, uniqueKey: `notify:${n.id}`, maxAttempts: 6 });
  } catch (e) {
    // gelijktijdige analyse maakte dezelfde melding al aan (unieke dedupeKey): niets te doen
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
}

export interface AdOverrides {
  recognition?: ManualOverrides;
  costs?: { repairCents?: number; shippingCents?: number; transportCents?: number; otherCents?: number; marginSchemeEligible?: boolean };
}

const BAND_RANK = { NOT_INTERESTING: 0, MODERATE: 1, INTERESTING: 2, VERY_INTERESTING: 3, TOP: 4 } as const;

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
}

export async function analyzeAd(adId: string, deps: AnalyzeDeps = {}): Promise<{ score: number; blocked: boolean } | null> {
  const cfg = deps.cfg ?? (await getConfig());
  const ad = await prisma.advertisement.findUnique({ where: { id: adId }, include: { images: { orderBy: { position: "asc" } } } });
  if (!ad) return null;
  const overrides = (ad.overrides ?? {}) as AdOverrides;

  // 1) Productherkenning: regels -> AI alleen indien nodig
  const attrs = (ad.rawPayload as { attributes?: Record<string, string | number> } | null)?.attributes ?? null;
  let rec: Recognition = recognize({ title: ad.title, description: ad.description, structured: attrs }, overrides.recognition);
  let provider = deps.provider;
  if (provider === undefined) provider = createProvider(cfg, await getSecret("ai.apiKey"));
  const ai = await enrichWithAi(rec, { title: ad.title, description: ad.description, imageUrls: ad.images.map((i) => i.url) }, cfg, provider ?? null);
  rec = ai.rec;
  if (ai.visibleDamage?.length) {
    const map: Record<string, Signal["code"]> = { screen: "SCREEN_DAMAGE", back: "BACK_DAMAGE", camera: "CAMERA_DAMAGE", frame: "COSMETIC_DAMAGE" };
    for (const d of ai.visibleDamage) {
      const code = map[d];
      if (code && !rec.signals.some((s) => s.code === code)) rec.signals.push({ code, evidence: "zichtbaar op foto (AI-inschatting)" });
    }
  }

  const storageGb = typeof rec.facts.storageGb?.value === "number" ? rec.facts.storageGb.value : null;
  const ramGb = typeof rec.facts.ramGb?.value === "number" ? rec.facts.ramGb.value : null;
  const battery = typeof rec.facts.batteryHealth?.value === "number" ? rec.facts.batteryHealth.value : null;

  // 2) Productrecord + specificaties bewaren (afgeleid; bron blijft onaangeroerd)
  const product = await prisma.appleProduct.upsert({
    where: { adId },
    create: { adId, family: rec.family, modelKey: rec.modelKey, modelLabel: rec.modelLabel, recognizedBy: rec.recognizedBy, confidence: rec.confidence, conditionGrade: rec.conditionGrade },
    update: { family: rec.family, modelKey: rec.modelKey, modelLabel: rec.modelLabel, recognizedBy: rec.recognizedBy, confidence: rec.confidence, conditionGrade: rec.conditionGrade },
  });
  await prisma.productSpecification.deleteMany({ where: { productId: product.id } });
  const specRows = Object.entries(rec.facts).map(([key, f]) => ({ productId: product.id, key, value: String(f.value), source: f.source, evidence: f.evidence ?? null }));
  for (const u of rec.unknown) if (!rec.facts[u]) specRows.push({ productId: product.id, key: u, value: "onbekend", source: "UNKNOWN", evidence: null });
  if (specRows.length) await prisma.productSpecification.createMany({ data: specRows });

  // 3) Voorlopig risico (voor opname in vergelijkingsset) en eigen marktdata-bijdrage
  const photoCount = ad.images.length;
  const pre = assessRisk({ recognition: rec, photoCount, descriptionLength: ad.description.length, askingCents: ad.askingPriceCents });
  const hasDamage = rec.signals.some((s) => ["SCREEN_DAMAGE", "BACK_DAMAGE", "CAMERA_DAMAGE", "SEVERE_DEFECT", "WATER_DAMAGE", "FOR_PARTS", "NON_ORIGINAL_PARTS"].includes(s.code));
  const comparableOk = !ad.duplicateOfId && !pre.blocked && !hasDamage && rec.family !== "unknown" && rec.confidence >= 0.6 && (ad.askingPriceCents ?? 0) > 0;
  const existingComp = await prisma.marketComparable.findFirst({ where: { sourceAdId: adId } });
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
    if (existingComp) await prisma.marketComparable.update({ where: { id: existingComp.id }, data: compData });
    else await prisma.marketComparable.create({ data: compData });
  } else if (existingComp) {
    await prisma.marketComparable.delete({ where: { id: existingComp.id } });
  }

  // 4) Waardering
  const comps = await prisma.marketComparable.findMany({ where: { modelKey: rec.modelKey, isDemo: ad.isDemo }, orderBy: { observedAt: "desc" }, take: 500 });
  const bat = batteryOutcome(rec.family, battery, cfg);
  const shippingList = (ad.shippingOptions as string[]) ?? [];
  const dist = distanceCosts(ad.distanceKm, shippingList, cfg);
  const repairCents = overrides.costs?.repairCents ?? repairCostFor(rec.signals, cfg) + bat.replacementCents;
  const val0 = valuate(
    { modelKey: rec.modelKey, storageGb, ramGb, batteryHealth: battery, conditionGrade: rec.conditionGrade, willBeRepaired: repairCents > 0 && (overrides.costs?.repairCents ?? 1) > 0, excludeSourceAdId: adId },
    comps.map((c) => ({ modelKey: c.modelKey, priceCents: c.priceCents, kind: c.kind, storageGb: c.storageGb, ramGb: c.ramGb, batteryHealth: c.batteryHealth, observedAt: c.observedAt, sourceAdId: c.sourceAdId })),
    cfg,
  );
  const val = bat.priceFactor === 1 ? val0 : { ...val0, lowCents: Math.round(val0.lowCents * bat.priceFactor), expectedCents: Math.round(val0.expectedCents * bat.priceFactor), highCents: Math.round(val0.highCents * bat.priceFactor) };

  // 5) Risico (definitief) en winst
  const policyFlags: RiskFlag[] = [];
  const policyReview: string[] = [];
  if (bat.exclude) policyFlags.push({ code: "BATTERY_POLICY", label: bat.notes[0] ?? "Batterijbeleid sluit deze advertentie uit", severity: "block", points: 100 });
  if (bat.review) { policyFlags.push({ code: "BATTERY_UNKNOWN", label: "Batterijconditie onbekend (apart beoordelen)", severity: "warn", points: 8 }); policyReview.push("Batterijconditie onbekend"); }
  const risk = assessRisk({ recognition: rec, photoCount, descriptionLength: ad.description.length, askingCents: ad.askingPriceCents, expectedCents: val.expectedCents, valuationConfidence: val.confidence, policyFlags, policyReviewReasons: policyReview });
  const costs = costsFromConfig(cfg, { repairCents, shippingCents: overrides.costs?.shippingCents ?? dist.shippingCents ?? undefined, transportCents: overrides.costs?.transportCents ?? dist.transportCents ?? undefined, otherCents: overrides.costs?.otherCents });
  const seller = assessSeller({
    verified: ad.sellerVerified, business: (ad.sellerSignals as { business?: boolean | null })?.business ?? null, anonymous: (ad.sellerSignals as { anonymous?: boolean | null })?.anonymous ?? null,
    photoCount, descriptionLength: ad.description.length, askingCents: ad.askingPriceCents, expectedCents: val.expectedCents, valuationConfidence: val.confidence, riskFlags: risk.flags, shipping: shippingList,
  });
  const tax = taxFromConfig(cfg, overrides.costs?.marginSchemeEligible);
  const buy = ad.askingPriceCents ?? 0;
  const priceKnown = ad.askingPriceCents != null && ad.askingPriceCents > 0;
  const pExp = calcProfit(buy, val.expectedCents, costs, tax);
  const pLow = calcProfit(buy, val.lowCents, costs, tax);
  const pHigh = calcProfit(buy, val.highCents, costs, tax);
  const maxBid = val.expectedCents > 0 ? maxBuyPrice(val.expectedCents, costs, tax, cfg.targets.minProfitCents, cfg.targets.minRoiPct) : 0;
  const maxBidCons = val.lowCents > 0 ? maxBuyPrice(val.lowCents, costs, tax, cfg.targets.minProfitCents, cfg.targets.minRoiPct) : 0;
  const minSale = priceKnown ? minSalePrice(buy, costs, tax, cfg.targets.minProfitCents) : 0;

  const needsReview = risk.needsManualReview || !priceKnown;
  const knownRatio = rec.unknown.length ? 1 - rec.unknown.length / (rec.unknown.length + Object.keys(rec.facts).length) : 1;
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
      activationUnverified: risk.flags.some((f) => f.code === "ACTIVATION_UNVERIFIED"),
      recognitionConfidence: rec.confidence,
    },
    cfg,
  );
  let explanation = sc.explanation;
  if (!priceKnown) explanation = "Geen vaste vraagprijs bekend (bieden/op aanvraag): winst en score kunnen niet worden bepaald. " + explanation;
  if (risk.blocked) explanation += " Blokkades: " + risk.flags.filter((f) => f.severity === "block").map((f) => f.label).join("; ") + ".";
  if (val.uncertain) explanation += " Let op: de marktwaarde is onzeker (te weinig of te wisselende vergelijkingsdata); behandel de winstverwachting niet als zeker.";

  // 6) Opslaan
  await prisma.$transaction(async (tx) => {
    await tx.dealAnalysis.updateMany({ where: { adId, isCurrent: true }, data: { isCurrent: false } });
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
        costs: { expected: pExp, conservative: pLow, optimistic: pHigh, valuationSteps: val.steps, repairCents, maxBidConservativeCents: maxBidCons, distance: dist, battery: bat, seller } as unknown as Prisma.InputJsonValue,
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
        scoreBreakdown: { factors: sc.factors, adjustments: sc.adjustments, rawScore: sc.rawScore } as unknown as Prisma.InputJsonValue,
        explanation,
        blocked: sc.blocked,
        settingsSnapshot: { targets: cfg.targets, costs: cfg.costs, tax: cfg.tax, weights: cfg.scoring.weights, valuation: cfg.valuation } as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.riskAssessment.upsert({
      where: { adId },
      create: { adId, level: risk.level, score: risk.score, flags: risk.flags as unknown as Prisma.InputJsonValue, blocked: risk.blocked, needsManualReview: needsReview },
      update: { level: risk.level, score: risk.score, flags: risk.flags as unknown as Prisma.InputJsonValue, blocked: risk.blocked, needsManualReview: needsReview },
    });
    const last = await tx.valuationHistory.findFirst({ where: { adId }, orderBy: { computedAt: "desc" } });
    if (!last || last.expectedCents !== val.expectedCents || last.sampleSize !== val.sampleSize) {
      await tx.valuationHistory.create({
        data: { adId, modelKey: rec.modelKey, lowCents: val.lowCents, expectedCents: val.expectedCents, highCents: val.highCents, confidence: val.confidence, sampleSize: val.sampleSize, realizedUsed: val.realizedUsed, uncertain: val.uncertain, methodology: { steps: val.steps, tier: val.tier } as unknown as Prisma.InputJsonValue },
      });
    }
    await tx.advertisement.update({ where: { id: adId }, data: { status: "ANALYZED", statusError: null, needsManualReview: needsReview, lastCheckedOkAt: new Date(), analyzedAt: new Date() } });
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
      askingCents: ad.askingPriceCents,
      expectedProfitCents: priceKnown ? pExp.netProfitCents : null,
      roiPct: priceKnown ? pExp.roiPct : null,
      maxBidCents: maxBid,
      distanceKm: ad.distanceKm,
      ageHours: ad.publishedAt ? (Date.now() - ad.publishedAt.getTime()) / 3600_000 : (Date.now() - ad.firstSeenAt.getTime()) / 3600_000,
      text: `${ad.title} ${ad.description}`.toLowerCase(),
      photoCount,
      descriptionLength: ad.description.length,
      shipping: (ad.shippingOptions as string[]) ?? [],
      condition: rec.conditionGrade,
      hasDefect: rec.signals.some((s) => ["SCREEN_DAMAGE", "BACK_DAMAGE", "CAMERA_DAMAGE", "SEVERE_DEFECT", "WATER_DAMAGE", "FOR_PARTS"].includes(s.code)),
      activationLock: (rec.facts.activationLock?.value as "locked" | "clear" | undefined) ?? null,
      mdm: rec.signals.some((s) => s.code === "MDM"),
      score: sc.score,
      riskScore: risk.score,
      riskLevel: risk.level,
      blocked: risk.blocked,
      location: ad.location,
      sellerTrust: seller.level === "UNKNOWN" ? null : seller.score,
      sellerTrustLevel: seller.level,
      sellerVerified: ad.sellerVerified ?? null,
      shippingAvailable: shippingList.includes("shipping"),
      pickupAvailable: shippingList.includes("pickup") || !shippingList.length,
      batteryKnown: battery != null,
      purchaseProof: rec.signals.some((s) => s.code === "NO_PURCHASE_PROOF") ? "no" : /aankoopbewijs|factuur|bon\b|kassabon|aankoopbon/i.test(`${ad.title} ${ad.description}`) ? "yes" : null,
    };
    await matchProfiles(adId, ctx, { band: sc.band, score: sc.score, blocked: risk.blocked, isDemo: ad.isDemo, userIgnored: ad.userState === "IGNORED", netProfitCents: pExp.netProfitCents, complete: ad.origin !== "SEARCH" || Boolean(ad.detailFetchedAt) || Boolean((ad.rawPayload as { detailFailed?: boolean } | null)?.detailFailed) }, cfg);
  }
  return { score: sc.score, blocked: sc.blocked };
}

export async function matchProfiles(
  adId: string,
  ctx: FilterContext,
  meta: { band: keyof typeof BAND_RANK; score: number; blocked: boolean; isDemo: boolean; userIgnored: boolean; netProfitCents: number; /** volledige advertentie beoordeeld (detailpagina) */ complete: boolean },
  cfg: AppConfig,
) {
  const profiles = await prisma.searchProfile.findMany({ where: { active: true } });
  const prefsCache = new Map<string, { prefs: NotifyPrefs; push: boolean }>();
  for (const p of profiles) {
    try {
      const tree = await loadTree(p.id);
      const matched = evaluate(tree, ctx);
      await prisma.profileMatch.upsert({ where: { profileId_adId: { profileId: p.id, adId } }, create: { profileId: p.id, adId, matched }, update: { matched } });
      const [discovered, interesting] = await Promise.all([
        prisma.profileMatch.count({ where: { profileId: p.id, matched: true, ad: { duplicateOfId: null } } }),
        prisma.profileMatch.count({ where: { profileId: p.id, matched: true, ad: { duplicateOfId: null, analyses: { some: { isCurrent: true, blocked: false, score: { gte: cfg.targets.minDealScore } } } } } }),
      ]);
      await prisma.searchProfile.update({ where: { id: p.id }, data: { discoveredCount: discovered, interestingCount: interesting } });

      // Meldingen: pas na volledige beoordeling (detailpagina) en nooit voor geblokkeerde/genegeerde/demo-advertenties
      const eligible = matched && p.notifyEnabled && cfg.notifications.enabled && !meta.blocked && !meta.userIgnored && !meta.isDemo && meta.score >= p.notifyMinScore && (meta.complete || !cfg.notifications.requireFullAnalysis);
      if (eligible) {
        let prefs = prefsCache.get(p.userId);
        if (!prefs) {
          prefs = { prefs: await getPrefs(p.userId), push: (await prisma.pushSubscription.count({ where: { userId: p.userId, enabled: true } })) > 0 };
          prefsCache.set(p.userId, prefs);
        }
        const runAt = quietEndsAt(prefs.prefs) ?? undefined;
        const floor = BAND_RANK[cfg.notifications.minBand];
        // Telegram/Discord: zoals per zoekprofiel ingesteld, tenzij de gebruiker Telegram uit zet of alleen als alternatief wil
        const skipChat = prefs.prefs.telegram === "off" || (prefs.prefs.telegram === "fallback" && prefs.push);
        if (!skipChat && BAND_RANK[meta.band] >= floor) {
          const channels = (p.notifyChannels as string[]).filter((c) => (cfg.notifications.channels as string[]).includes(c));
          for (const ch of channels) await createNotification({ adId, profileId: p.id, userId: p.userId, channel: ch as "TELEGRAM" | "DISCORD", dedupeKey: `${ch}:${adId}:${p.id}`, runAt });
        }
        // Web Push: één melding per gebruiker per advertentie (ook als meerdere profielen matchen)
        if (prefs.push && prefs.prefs.push && passesPrefs(prefs.prefs, { score: meta.score, band: meta.band, netProfitCents: meta.netProfitCents, profileId: p.id }).ok) {
          await createNotification({ adId, profileId: p.id, userId: p.userId, channel: "WEBPUSH", dedupeKey: `WEBPUSH:${adId}:${p.userId}`, runAt });
        }
      }
    } catch (e) {
      log("error", "Profielmatch mislukt", { profileId: p.id, adId, error: errMsg(e) });
    }
  }
}
