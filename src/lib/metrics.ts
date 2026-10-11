import { prisma } from "./db/client";
import { getCooldown } from "./jobs/cooldown";
import { buildSlices, peekFacets, type FacetMap } from "./sources/facets";
import { estimateRounds, getSliceState, specsFromConfig, type RoundEstimate } from "./sources/slice-plan";
import { getConfig } from "./settings/store";

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export interface Dist {
  n: number;
  avg: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

/** Waarden in seconden. */
export function summarize(values: number[]): Dist {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0);
  return { n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, p50: percentile(v, 50), p95: percentile(v, 95), max: v.length ? Math.max(...v) : null };
}

const sec = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 1000;

export interface PerformanceData {
  generatedAt: string;
  profiles: Array<{ id: string; name: string; active: boolean; intervalMinutes: number; lastSuccessAt: string | null; lastError: string | null; secondsSinceSuccess: number | null; overdue: boolean; coverage: { total: number; covered: number; pct: number } | null; rounds: (RoundEstimate & { seen: number }) | null }>;
  activeProfiles: number;
  lastSuccessSeconds: number | null;
  checks24h: { total: number; failed: number; missed: number; avgDurationMs: number | null; cacheHitPct: number | null };
  adsPerHour: Array<{ hour: string; count: number }>;
  newAds24h: number;
  latency: { prefilter: Dist; fullAnalysis: Dist; toNotification: Dist; push: Dist; endToEnd: Dist };
  notifications7d: { sent: number; failed: number; pending: number; skipped: number };
  estimatedMaxDetectionDelayMinutes: number | null;
  queue: { pending: number; running: number; dead: number };
  cooldown: { until: string; reason: string } | null;
  fast: { enabled: boolean; profiles: number; intervalSeconds: number };
}

export async function getPerformance(days = 7): Promise<PerformanceData> {
  const cfg = await getConfig();
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400_000);
  const since24 = new Date(now.getTime() - 86400_000);
  const lastRuns = await prisma.checkRun.findMany({ where: { ok: true, totalResults: { not: null } }, orderBy: { startedAt: "desc" }, take: 300, select: { profileId: true, totalResults: true, covered: true } });
  const cov = new Map<string, { total: number; covered: number; pct: number }>();
  for (const r of lastRuns) if (!cov.has(r.profileId) && r.totalResults) cov.set(r.profileId, { total: r.totalResults, covered: r.covered ?? 0, pct: Math.min(100, Math.round(((r.covered ?? 0) / r.totalResults) * 100)) });
  const [profiles, runs, ads, notifs, jobs] = await Promise.all([
    prisma.searchProfile.findMany({ select: { id: true, name: true, active: true, intervalMinutes: true, lastSuccessAt: true, lastError: true, sourceKind: true, sourceConfig: true } }),
    prisma.checkRun.findMany({ where: { startedAt: { gte: since24 } }, select: { ok: true, durationMs: true, pages: true, cacheHits: true } }),
    prisma.advertisement.findMany({ where: { isDemo: false, firstSeenAt: { gte: since } }, select: { firstSeenAt: true, prefilteredAt: true, analyzedAt: true } }),
    prisma.notification.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, sentAt: true, status: true, ad: { select: { firstSeenAt: true, isDemo: true } } } }),
    prisma.backgroundJob.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const minInterval = (p: { intervalMinutes: number; sourceKind: string }) => (p.sourceKind === "SEARCH" ? Math.max(p.intervalMinutes, cfg.scheduler.minIntervalMinutes) : p.intervalMinutes);
  const roundsFor = new Map<string, RoundEstimate & { seen: number }>();
  for (const p of profiles) {
    const sc = (p.sourceConfig ?? {}) as { sliceModels?: string[]; sliceStorages?: number[]; priorityModels?: string[] };
    if (!p.active || !cfg.scheduler.fast.enabled || !sc.sliceModels?.length) continue;
    const specs = specsFromConfig(sc);
    const facets = new Map<string, FacetMap>();
    for (const cat of new Set(specs.map((x) => x.model.category))) {
      const f = await peekFacets(cat);
      if (f) facets.set(cat, f);
    }
    const built = buildSlices(specs, facets);
    if (!built.slices.length) continue;
    const st = await getSliceState(p.id);
    roundsFor.set(p.id, { ...estimateRounds(built.slices, st, cfg.scheduler.fast.pagesPerRun, cfg.scheduler.fast.intervalSeconds), seen: built.slices.filter((s) => st[s.url]).length });
  }
  const prof = profiles.map((p) => {
    const since = p.lastSuccessAt ? sec(p.lastSuccessAt, now) : null;
    const interval = minInterval(p);
    return { id: p.id, name: p.name, active: p.active, intervalMinutes: interval, lastSuccessAt: p.lastSuccessAt?.toISOString() ?? null, lastError: p.lastError, secondsSinceSuccess: since, overdue: p.active && (since == null || since > interval * 60 * 2 + 120), coverage: cov.get(p.id) ?? null, rounds: roundsFor.get(p.id) ?? null };
  });
  const active = prof.filter((p) => p.active);
  const lastOk = active.map((p) => p.secondsSinceSuccess).filter((x): x is number => x != null);
  const durations = runs.map((r) => r.durationMs).filter((x): x is number => x != null);
  const pages = runs.reduce((a, r) => a + r.pages, 0);
  const hits = runs.reduce((a, r) => a + r.cacheHits, 0);

  const hours: Record<string, number> = {};
  for (let i = 23; i >= 0; i--) hours[new Date(now.getTime() - i * 3600_000).toISOString().slice(0, 13)] = 0;
  for (const a of ads) {
    const k = a.firstSeenAt.toISOString().slice(0, 13);
    if (k in hours) hours[k]++;
  }
  const real = notifs.filter((n) => !n.ad.isDemo);
  const sent = real.filter((n) => n.sentAt);
  const analysisSecs = ads.filter((a) => a.analyzedAt).map((a) => sec(a.firstSeenAt, a.analyzedAt!));
  const dist = {
    prefilter: summarize(ads.filter((a) => a.prefilteredAt).map((a) => sec(a.firstSeenAt, a.prefilteredAt!))),
    fullAnalysis: summarize(analysisSecs),
    toNotification: summarize(real.map((n) => sec(n.ad.firstSeenAt, n.createdAt))),
    push: summarize(sent.map((n) => sec(n.createdAt, n.sentAt!))),
    endToEnd: summarize(sent.map((n) => sec(n.ad.firstSeenAt, n.sentAt!))),
  };
  const searchProfiles = active.filter((p) => p.intervalMinutes);
  const fastMin = cfg.scheduler.fast.enabled && profiles.some((p) => p.active && p.sourceKind === "SEARCH" && (p.sourceConfig as { fastMode?: boolean } | null)?.fastMode === true) ? cfg.scheduler.fast.intervalSeconds / 60 : null;
  const maxInterval = fastMin ?? (searchProfiles.length ? Math.min(...searchProfiles.map((p) => p.intervalMinutes)) : null);
  const jobMap = Object.fromEntries(jobs.map((j) => [j.status, j._count._all]));
  return {
    generatedAt: now.toISOString(),
    profiles: prof,
    activeProfiles: active.length,
    lastSuccessSeconds: lastOk.length ? Math.min(...lastOk) : null,
    checks24h: { total: runs.length, failed: runs.filter((r) => !r.ok).length, missed: prof.filter((p) => p.overdue).length, avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null, cacheHitPct: pages + hits ? (hits / (pages + hits)) * 100 : null },
    adsPerHour: Object.entries(hours).map(([hour, count]) => ({ hour, count })),
    newAds24h: ads.filter((a) => a.firstSeenAt >= since24).length,
    latency: dist,
    notifications7d: { sent: real.filter((n) => n.status === "SENT").length, failed: real.filter((n) => n.status === "FAILED").length, pending: real.filter((n) => n.status === "PENDING").length, skipped: real.filter((n) => n.status === "SKIPPED").length },
    // Schatting: een nieuwe advertentie wordt uiterlijk één controle-interval + verwerkingstijd na plaatsing gezien (mits hij in de opgehaalde pagina's staat)
    estimatedMaxDetectionDelayMinutes: maxInterval == null ? null : maxInterval + (dist.endToEnd.p95 ?? dist.fullAnalysis.p95 ?? 0) / 60,
    cooldown: await getCooldown("marktplaats-search").then((c) => (c ? { until: c.until.toISOString(), reason: c.reason } : null)),
    fast: { enabled: cfg.scheduler.fast.enabled, profiles: profiles.filter((p) => p.active && p.sourceKind === "SEARCH" && (p.sourceConfig as { fastMode?: boolean } | null)?.fastMode === true).length, intervalSeconds: cfg.scheduler.fast.intervalSeconds },
    queue: { pending: jobMap.PENDING ?? 0, running: jobMap.RUNNING ?? 0, dead: (jobMap.DEAD ?? 0) + (jobMap.FAILED ?? 0) },
  };
}
