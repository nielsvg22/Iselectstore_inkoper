import { prisma } from "./db/client";
import { getConfig, secretStatus } from "./settings/store";
import { listAdapters } from "./sources/adapters";

export async function getStatus() {
  const cfg = await getConfig();
  const [profiles, health, jobCounts, recentErrors, processed, aiToday, failedAds, lastJob] = await Promise.all([
    prisma.searchProfile.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.sourceHealth.findMany(),
    prisma.backgroundJob.groupBy({ by: ["status"], _count: true }),
    prisma.backgroundJob.findMany({ where: { lastError: { not: null } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, type: true, status: true, lastError: true, attempts: true, createdAt: true } }),
    prisma.advertisement.count({ where: { status: "ANALYZED" } }),
    prisma.aiUsage.findMany({ where: { day: new Date().toISOString().slice(0, 10) } }),
    prisma.advertisement.count({ where: { status: "FAILED" } }),
    prisma.backgroundJob.findFirst({ where: { status: "DONE" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
  ]);
  const secrets = await secretStatus();
  return {
    profiles: profiles.map((p) => ({ id: p.id, name: p.name, active: p.active, sourceKind: p.sourceKind, intervalMinutes: p.intervalMinutes, lastCheckedAt: p.lastCheckedAt, lastSuccessAt: p.lastSuccessAt, lastError: p.lastError, discoveredCount: p.discoveredCount, interestingCount: p.interestingCount })),
    sources: listAdapters().map((a) => {
      const h = health.find((x) => x.id === a.id);
      return { id: a.id, label: a.label, automatic: a.automatic, minIntervalMinutes: a.minIntervalMinutes, enabled: cfg.sources.allowed.includes(a.origin), ok: h?.ok ?? null, lastOkAt: h?.lastOkAt ?? null, lastErrorAt: h?.lastErrorAt ?? null, lastError: h?.lastError ?? null, requestsToday: h?.requestsToday ?? 0, dailyLimit: cfg.limits.requestsPerDayPerSource };
    }),
    jobs: Object.fromEntries(jobCounts.map((j) => [j.status, j._count])),
    recentErrors,
    processedAds: processed,
    failedAds,
    lastJobFinishedAt: lastJob?.finishedAt ?? null,
    ai: { provider: cfg.ai.provider, calls: aiToday.reduce((a, r) => a + r.calls, 0), costEur: aiToday.reduce((a, r) => a + r.costMicros, 0) / 1e6, maxCalls: cfg.ai.maxCallsPerDay, maxCostEur: cfg.ai.maxCostEurPerDay },
    secrets: Object.fromEntries(secrets.map((s) => [s.key, s.isSet])),
    demoMode: cfg.demoMode,
  };
}
