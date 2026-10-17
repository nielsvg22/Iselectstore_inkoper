import type { BackgroundJob } from "@prisma/client";
import { prisma } from "../db/client";
import { errMsg } from "../log";
import { deliverNotification } from "../notify/dispatch";
import { cleanupPushSubscriptions } from "../notify/push";
import { analyzeAd } from "../pipeline/analyze";
import { ingestAd } from "../pipeline/ingest";
import { getConfig } from "../settings/store";
import { adapterForOrigin } from "../sources/adapters";
import { loadTree } from "../pipeline/tree";
import { buildPrefilter } from "../sources/prefilter";
import { fetchListingUrl } from "../sources/adapters-shared";
import { mergeDetail } from "../sources/marktplaats-search";
import { SourceError, type RawAd } from "../sources/types";
import { getCooldown, setCooldown } from "./cooldown";
import { modelByKey } from "../catalog/apple";
import {
  getSliceState,
  selectSlices,
  setSliceState,
  specsFromConfig,
} from "../sources/slice-plan";
import {
  buildSlices,
  getFacets,
  getLastFullSearch,
  setLastFullSearch,
  sliceSpecsFromTree,
  type FacetMap,
  type Slice,
} from "../sources/facets";
import {
  enqueue,
  PermanentJobError,
  type Handler,
  type JobType,
} from "./queue";

const day = () => new Date().toISOString().slice(0, 10);

async function recordSource(
  id: string,
  ok: boolean,
  error?: string,
  requests = 0,
) {
  const d = day();
  const cur = await prisma.sourceHealth.findUnique({ where: { id } });
  const reqToday = (cur?.day === d ? cur.requestsToday : 0) + requests;
  const data = ok
    ? {
        ok: true,
        lastOkAt: new Date(),
        lastError: null as string | null,
        requestsToday: reqToday,
        day: d,
      }
    : {
        ok: false,
        lastErrorAt: new Date(),
        lastError: (error ?? "onbekend").slice(0, 400),
        requestsToday: reqToday,
        day: d,
      };
  await prisma.sourceHealth.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

export async function runProfileCheck(
  profileId: string,
): Promise<{ fetched: number; created: number; changed: number }> {
  const profile = await prisma.searchProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile || !profile.active)
    return { fetched: 0, created: 0, changed: 0 };
  const cfg = await getConfig();
  const adapter = adapterForOrigin(profile.sourceKind);
  if (!adapter)
    throw new PermanentJobError(`Onbekende bron ${profile.sourceKind}`);
  if (!cfg.sources.allowed.includes(profile.sourceKind)) {
    await prisma.searchProfile.update({
      where: { id: profileId },
      data: {
        lastCheckedAt: new Date(),
        lastError: `Bron ${adapter.label} is uitgeschakeld in de instellingen`,
      },
    });
    throw new PermanentJobError("Bron uitgeschakeld in instellingen");
  }
  // Bewust géén dagelijkse blokkade: zoeken mag nooit stoppen op een eigen requestlimiet (de pacing per request beschermt de bron al).
  const sc = (profile.sourceConfig ?? {}) as {
    fastMode?: boolean;
    fetchDetails?: boolean;
    smartRadar?: boolean;
  };
  const fast =
    adapter.origin === "SEARCH" &&
    cfg.scheduler.fast.enabled &&
    sc.fastMode === true;
  if (adapter.origin === "SEARCH") {
    const cd = await getCooldown(adapter.id);
    if (cd)
      throw new PermanentJobError(
        `Gepauzeerd tot ${cd.until.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}: ${cd.reason}`,
      );
  }
  const run = await prisma.checkRun.create({ data: { profileId } });
  const t0 = Date.now();
  const stats: {
    pages: number;
    cacheHits: number;
    total?: number;
    covered?: number;
  } = { pages: 0, cacheHits: 0 };
  try {
    const tree = adapter.origin === "SEARCH" ? await loadTree(profileId) : null;
    const prefilter = tree ? buildPrefilter(tree) : undefined;
    // Slim zoeken (snelle modus): smalle filterpagina's per model/opslag; af en toe de volledige zoekterm als vangnet
    let slices: Slice[] | undefined;
    let fullSearch = false;
    let extraQueries: string[] | undefined;
    let sliceStateBefore: Record<
      string,
      { at: string; pages: number; total: number | null }
    > | null = null;
    const unitResults: Record<
      string,
      { at: string; pages: number; total: number | null }
    > = {};
    if (
      fast &&
      tree &&
      (profile.sourceConfig as { sliceSearch?: boolean } | null)
        ?.sliceSearch !== false
    ) {
      const scfg = (profile.sourceConfig ?? {}) as {
        sliceModels?: string[];
        sliceStorages?: number[];
        priorityModels?: string[];
      };
      const specs = scfg.sliceModels?.length
        ? specsFromConfig(scfg)
        : sliceSpecsFromTree(tree);
      if (specs.length) {
        const last = await getLastFullSearch(profileId);
        fullSearch =
          !last ||
          Date.now() - last.getTime() >
            cfg.scheduler.fast.fullSearchEveryMinutes * 60_000;
        if (!fullSearch) {
          const facets = new Map<string, FacetMap>();
          for (const cat of new Set(specs.map((x) => x.model.category)))
            facets.set(cat, await getFacets(cat));
          const built = buildSlices(specs, facets);
          if (built.slices.length) {
            // Rondlopend: alleen de slices die nu aan de beurt zijn, binnen het paginabudget per controle
            sliceStateBefore = await getSliceState(profileId);
            slices = selectSlices(
              built.slices,
              sliceStateBefore,
              Date.now(),
              sc.smartRadar ? 2 : cfg.scheduler.fast.pagesPerRun,
              {
                highMs: cfg.scheduler.fast.priorityEveryMinutes * 60_000,
                normalMs: cfg.scheduler.fast.normalEveryMinutes * 60_000,
              },
            );
            // Modellen zonder filterpagina (built.missing) worden gedekt door het vangnet: de volledige zoektermen, elke paar minuten
          } else fullSearch = true; // geen enkel model heeft een filterpagina: veilig terugvallen op de zoekterm
        }
      }
    }
    if (sc.smartRadar && slices?.length) {
      const queries = (profile.sourceConfig as { queries?: string[] })
        .queries ?? ["iphone"];
      const others = queries.filter((q) => q !== "iphone");
      extraQueries = [
        "iphone",
        ...(others.length
          ? [others[Math.floor(Date.now() / 60000) % others.length]]
          : []),
      ];
    }
    if (fullSearch) await setLastFullSearch(profileId);
    let created = 0;
    let changed = 0;
    const processed = new Set<string>();
    const wantsDetail =
      adapter.origin === "SEARCH" &&
      ((profile.sourceConfig ?? {}) as { fetchDetails?: boolean })
        .fetchDetails !== false;
    const ingestPage = async (page: RawAd[]) => {
      for (const raw of page) {
        if (processed.has(raw.externalId)) continue;
        processed.add(raw.externalId);
        const r = await ingestAd(raw, {
          origin: adapter.origin,
          isDemo: adapter.origin === "DEMO",
          partial: adapter.origin === "SEARCH",
        });
        if (r.created) created++;
        if (r.changed) changed++;
        if (wantsDetail && !raw.detailLoaded && (r.created || r.changed))
          await enqueueDetail(r.adId, r.created);
      }
    };
    const ads = await adapter.fetchProfile({
      profileId,
      slices,
      onAds: ingestPage,
      query: profile.query,
      config: (profile.sourceConfig ?? {}) as Record<string, unknown>,
      maxAds: fast
        ? Math.max(cfg.limits.maxAdsPerRun, cfg.scheduler.fast.pages * 30 * 4)
        : cfg.limits.maxAdsPerRun,
      prefilter,
      deferDetails: adapter.origin === "SEARCH",
      stats,
      extraQueries,
      onUnit: (key, i) => {
        unitResults[key] = {
          at: new Date().toISOString(),
          pages: i.pages,
          total: i.total,
        };
      },
      fast: fast ? { pages: cfg.scheduler.fast.pages } : undefined,
      cacheSeconds: fast
        ? Math.min(cfg.scheduler.pageCacheSeconds, 15)
        : Math.min(
            cfg.scheduler.pageCacheSeconds,
            Math.max(0, Math.floor((profile.intervalMinutes * 60) / 2)),
          ),
    });
    if (sliceStateBefore && Object.keys(unitResults).length)
      await setSliceState(profileId, {
        ...sliceStateBefore,
        ...Object.fromEntries(
          Object.entries(unitResults).filter(([k]) => k.startsWith("http")),
        ),
      });
    await ingestPage(ads);
    await recordSource(adapter.id, true, undefined, Math.max(1, stats.pages));
    const now = new Date();
    // Eerste geslaagde controle van een zoekprofiel = "nulmeting": wat er al stond wordt nooit als nieuwe deal gemeld
    const baseline =
      adapter.origin === "SEARCH" &&
      !((profile.sourceConfig ?? {}) as { baselineAt?: string }).baselineAt
        ? {
            sourceConfig: {
              ...((profile.sourceConfig ?? {}) as object),
              baselineAt: now.toISOString(),
            },
          }
        : {};
    await prisma.searchProfile.update({
      where: { id: profileId },
      data: {
        lastCheckedAt: new Date(t0),
        lastSuccessAt: now,
        lastError: null,
        ...baseline,
      },
    });
    await prisma.checkRun.update({
      where: { id: run.id },
      data: {
        finishedAt: now,
        durationMs: Date.now() - t0,
        ok: true,
        fetched: ads.length,
        created,
        pages: stats.pages,
        cacheHits: stats.cacheHits,
        totalResults: stats.total ?? null,
        covered: stats.covered ?? null,
      },
    });
    return { fetched: ads.length, created, changed };
  } catch (e) {
    const msg = errMsg(e);
    // Blokkade door de bron (403/429): pauzeren met oplopende wachttijd — nooit omzeilen
    if (
      adapter.origin === "SEARCH" &&
      /\bHTTP (403|429)\b/.test(msg) &&
      !(await getCooldown(adapter.id))
    )
      await setCooldown(adapter.id, msg);
    await recordSource(adapter.id, false, msg, 1);
    await prisma.searchProfile.update({
      where: { id: profileId },
      data: { lastCheckedAt: new Date(t0), lastError: msg },
    });
    await prisma.checkRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        durationMs: Date.now() - t0,
        ok: false,
        error: msg.slice(0, 300),
        pages: stats.pages,
        cacheHits: stats.cacheHits,
      },
    });
    if (e instanceof SourceError && !e.retryable)
      throw new PermanentJobError(msg);
    throw e;
  }
}

/** Zet het ophalen van de volledige advertentie klaar (nieuwe advertenties eerst). */
export async function enqueueDetail(adId: string, isNew: boolean) {
  const ad = await prisma.advertisement.findUnique({
    where: { id: adId },
    select: { detailFetchedAt: true, contentHash: true },
  });
  if (!ad || ad.detailFetchedAt) return;
  await enqueue({
    type: "FETCH_DETAIL",
    payload: { adId },
    priority: isNew ? 25 : 14,
    uniqueKey: `detail:${adId}`,
    maxAttempts: 3,
  });
}

/** Haalt de detailpagina op, vult de advertentie aan en laat die opnieuw beoordelen. */
export async function runDetailFetch(
  adId: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const ad = await prisma.advertisement.findUnique({
    where: { id: adId },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!ad || ad.isDemo || ad.detailFetchedAt) return;
  const cfg = await getConfig();
  try {
    const d = await fetchListingUrl(ad.url, {
      allowlist: cfg.sources.urlAllowlist,
      minSecondsBetween: Math.max(
        cfg.limits.minSecondsBetweenRequests,
        process.env.NODE_ENV === "test" ? 0 : 3,
      ),
      fetchImpl,
      throttleId: "search-detail",
    });
    const attrs = (
      ad.rawPayload as { attributes?: Record<string, string | number> } | null
    )?.attributes;
    const list: RawAd = {
      externalId: ad.externalId,
      url: ad.url,
      title: ad.title,
      description: ad.description,
      askingCents: ad.askingPriceCents,
      location: ad.location,
      distanceKm: ad.distanceKm,
      category: ad.category,
      sellerType: ad.sellerType,
      shipping: (ad.shippingOptions as string[]) ?? [],
      conditionText: ad.conditionText,
      publishedAt: ad.publishedAt,
      imageUrls: ad.images.map((i) => i.url),
      attributes: attrs,
    };
    await ingestAd(mergeDetail(list, d), {
      origin: ad.origin,
      source: ad.source,
      partial: true,
    });
    await enqueue({
      type: "ANALYZE_AD",
      payload: { adId },
      priority: 12,
      uniqueKey: `analyze:${adId}:full`,
    });
  } catch (e) {
    // Definitief mislukt (verkocht/verwijderd/geweigerd): markeer, zodat de melding niet eindeloos wacht
    const permanent = e instanceof SourceError && !e.retryable;
    if (
      permanent ||
      (await prisma.backgroundJob.findFirst({
        where: { uniqueKey: `detail:${adId}`, attempts: { gte: 3 } },
      }))
    ) {
      const raw = ((ad.rawPayload ?? {}) as Record<string, unknown>) ?? {};
      await prisma.advertisement.update({
        where: { id: adId },
        data: { rawPayload: { ...raw, detailFailed: true } as never },
      });
      await enqueue({
        type: "ANALYZE_AD",
        payload: { adId },
        priority: 20,
        uniqueKey: `analyze:${adId}:detailfailed`,
      });
      return;
    }
    throw e;
  }
}

export const handlers: Partial<Record<JobType, Handler>> = {
  async CHECK_PROFILE(job: BackgroundJob) {
    await runProfileCheck((job.payload as { profileId: string }).profileId);
  },
  async FETCH_DETAIL(job: BackgroundJob) {
    await runDetailFetch((job.payload as { adId: string }).adId);
  },
  async ANALYZE_AD(job: BackgroundJob) {
    const adId = (job.payload as { adId: string }).adId;
    try {
      // Per advertentie één analyse tegelijk (lijst- en detailfase kunnen anders gelijktijdig draaien en elkaar tegenwerken)
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${adId}))`;
          await analyzeAd(adId, {
            quick: (job.payload as { quick?: boolean }).quick === true,
          });
        },
        { timeout: 180_000, maxWait: 60_000 },
      );
    } catch (e) {
      await prisma.advertisement.updateMany({
        where: { id: adId },
        data: { status: "FAILED", statusError: errMsg(e) },
      });
      throw e;
    }
  },
  async NOTIFY(job: BackgroundJob) {
    await deliverNotification(
      (job.payload as { notificationId: string }).notificationId,
    );
  },
  async CLEANUP() {
    const cfg = await getConfig();
    const cutoff = new Date(Date.now() - cfg.limits.adRetentionDays * 86400000);
    // Advertenties en inkoophistorie blijven bewaard; alleen tijdelijke jobs/cache opruimen.
    await prisma.backgroundJob.deleteMany({
      where: {
        status: { in: ["DONE", "FAILED", "DEAD"] },
        finishedAt: { lt: new Date(Date.now() - 14 * 86400000) },
      },
    });
    await cleanupPushSubscriptions();
    await prisma.aiCache.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } },
    });
    await prisma.marketComparable.deleteMany({
      where: {
        kind: { not: "REALIZED" },
        observedAt: { lt: new Date(Date.now() - 365 * 86400000) },
      },
    });
  },
};

/** Zet controle-jobs klaar voor profielen die aan de beurt zijn (snelle profielen op seconden, de rest op minuten). */
export async function scheduleDueProfiles(now = new Date()): Promise<number> {
  const cfg = await getConfig();
  const profiles = await prisma.searchProfile.findMany({
    where: { active: true },
    orderBy: [{ prioritizeNew: "desc" }, { lastCheckedAt: "asc" }],
  });
  const cooldown = await getCooldown("marktplaats-search", now);
  // Totaal-rem voor snelle profielen: maximaal N pagina-requests per minuut over alles samen
  const recentPages = await prisma.checkRun.aggregate({
    _sum: { pages: true },
    where: { startedAt: { gte: new Date(now.getTime() - 60_000) } },
  });
  let budget =
    cfg.scheduler.fast.maxRequestsPerMinute - (recentPages._sum.pages ?? 0);
  let n = 0;
  // Verwachte paginakosten per profiel = wat de laatste controle kostte (anders een voorzichtige schatting)
  const lastRuns = await prisma.checkRun.findMany({
    where: {
      ok: true,
      startedAt: { gte: new Date(now.getTime() - 6 * 3600_000) },
    },
    orderBy: { startedAt: "desc" },
    take: 500,
    select: { profileId: true, pages: true },
  });
  const lastPages = new Map<string, number>();
  for (const r of lastRuns)
    if (!lastPages.has(r.profileId) && r.pages > 0)
      lastPages.set(r.profileId, r.pages);
  const plan = profiles.flatMap((p) => {
    const adapter = adapterForOrigin(p.sourceKind);
    if (!adapter || !adapter.automatic) return [];
    const isSearch = adapter.origin === "SEARCH";
    const sc = (p.sourceConfig ?? {}) as {
      mailOnly?: boolean;
      fastMode?: boolean;
      tier?: "high" | "normal";
    };
    if (isSearch && sc.mailOnly === true) return []; // alleen via mailbox
    if (isSearch && cooldown) return [];
    const fast = isSearch && cfg.scheduler.fast.enabled && sc.fastMode === true;
    // Per model ingedeelde profielen: prioriteitsmodellen vaker dan de rest; overige snelle profielen op het snelle interval
    const fastMs =
      sc.tier === "high"
        ? cfg.scheduler.fast.priorityEveryMinutes * 60_000
        : sc.tier === "normal"
          ? cfg.scheduler.fast.normalEveryMinutes * 60_000
          : cfg.scheduler.fast.intervalSeconds * 1000;
    const intervalMs = fast
      ? Math.max(
          fastMs,
          cfg.scheduler.fast.intervalSeconds * 1000 * (sc.tier ? 1 : 0),
        )
      : Math.max(
          p.intervalMinutes,
          isSearch
            ? Math.max(
                cfg.scheduler.minIntervalMinutes,
                adapter.minIntervalMinutes,
              )
            : adapter.minIntervalMinutes,
        ) * 60_000;
    const age = p.lastCheckedAt
      ? now.getTime() - p.lastCheckedAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (age < intervalMs) return [];
    return [
      {
        p,
        fast,
        intervalMs,
        ratio: age / intervalMs,
        high: sc.tier === "high",
      },
    ];
  });
  // Grootste achterstand t.o.v. het doelinterval eerst (nooit gecontroleerd = eerst), prioriteit bij gelijke stand
  plan.sort((a, b) =>
    a.ratio === b.ratio ? Number(b.high) - Number(a.high) : b.ratio - a.ratio,
  );
  for (const { p, fast, intervalMs } of plan) {
    if (fast) {
      if (budget < 1) continue; // wacht op de volgende ronde
      budget -= lastPages.get(p.id) ?? 4;
    }
    if (
      await prisma.backgroundJob.findFirst({
        where: {
          type: "CHECK_PROFILE",
          status: { in: ["PENDING", "RUNNING"] },
          payload: { path: ["profileId"], equals: p.id },
        },
        select: { id: true },
      })
    )
      continue;
    const slot = Math.floor(now.getTime() / intervalMs);
    const r = await enqueue({
      type: "CHECK_PROFILE",
      payload: { profileId: p.id },
      priority: fast ? 28 : p.prioritizeNew ? 15 : 6,
      uniqueKey: `check:${p.id}:${slot}`,
      maxAttempts: 3,
    });
    if (r.created) n++;
  }
  await enqueue({
    type: "CLEANUP",
    payload: {},
    priority: 1,
    uniqueKey: `cleanup:${now.toISOString().slice(0, 10)}`,
    maxAttempts: 1,
  });
  return n;
}
