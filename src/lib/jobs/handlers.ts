import type { BackgroundJob } from "@prisma/client";
import { prisma } from "../db/client";
import { errMsg } from "../log";
import { deliverNotification } from "../notify/dispatch";
import { analyzeAd } from "../pipeline/analyze";
import { ingestAd } from "../pipeline/ingest";
import { getConfig } from "../settings/store";
import { adapterForOrigin } from "../sources/adapters";
import { loadTree } from "../pipeline/tree";
import { buildPrefilter } from "../sources/prefilter";
import { SourceError } from "../sources/types";
import { enqueue, PermanentJobError, type Handler, type JobType } from "./queue";

const day = () => new Date().toISOString().slice(0, 10);

async function recordSource(id: string, ok: boolean, error?: string, requests = 0) {
  const d = day();
  const cur = await prisma.sourceHealth.findUnique({ where: { id } });
  const reqToday = (cur?.day === d ? cur.requestsToday : 0) + requests;
  const data = ok ? { ok: true, lastOkAt: new Date(), lastError: null as string | null, requestsToday: reqToday, day: d } : { ok: false, lastErrorAt: new Date(), lastError: (error ?? "onbekend").slice(0, 400), requestsToday: reqToday, day: d };
  await prisma.sourceHealth.upsert({ where: { id }, create: { id, ...data }, update: data });
}

export async function runProfileCheck(profileId: string): Promise<{ fetched: number; created: number; changed: number }> {
  const profile = await prisma.searchProfile.findUnique({ where: { id: profileId } });
  if (!profile || !profile.active) return { fetched: 0, created: 0, changed: 0 };
  const cfg = await getConfig();
  const adapter = adapterForOrigin(profile.sourceKind);
  if (!adapter) throw new PermanentJobError(`Onbekende bron ${profile.sourceKind}`);
  if (!cfg.sources.allowed.includes(profile.sourceKind)) {
    await prisma.searchProfile.update({ where: { id: profileId }, data: { lastCheckedAt: new Date(), lastError: `Bron ${adapter.label} is uitgeschakeld in de instellingen` } });
    throw new PermanentJobError("Bron uitgeschakeld in instellingen");
  }
  // Dagelijkse requestlimiet per bron
  const h = await prisma.sourceHealth.findUnique({ where: { id: adapter.id } });
  if (h && h.day === day() && h.requestsToday >= cfg.limits.requestsPerDayPerSource) {
    await prisma.searchProfile.update({ where: { id: profileId }, data: { lastCheckedAt: new Date(), lastError: "Dagelijkse requestlimiet voor deze bron bereikt" } });
    throw new PermanentJobError("Dagelijkse requestlimiet bereikt");
  }
  try {
    const prefilter = adapter.origin === "SEARCH" ? buildPrefilter(await loadTree(profileId)) : undefined;
    const ads = await adapter.fetchProfile({ profileId, query: profile.query, config: (profile.sourceConfig ?? {}) as Record<string, unknown>, maxAds: cfg.limits.maxAdsPerRun, prefilter });
    let created = 0;
    let changed = 0;
    for (const raw of ads) {
      const r = await ingestAd(raw, { origin: adapter.origin, isDemo: adapter.origin === "DEMO" });
      if (r.created) created++;
      if (r.changed) changed++;
    }
    await recordSource(adapter.id, true, undefined, Math.max(1, ads.length));
    await prisma.searchProfile.update({ where: { id: profileId }, data: { lastCheckedAt: new Date(), lastSuccessAt: new Date(), lastError: null } });
    return { fetched: ads.length, created, changed };
  } catch (e) {
    const msg = errMsg(e);
    await recordSource(adapter.id, false, msg, 1);
    await prisma.searchProfile.update({ where: { id: profileId }, data: { lastCheckedAt: new Date(), lastError: msg } });
    if (e instanceof SourceError && !e.retryable) throw new PermanentJobError(msg);
    throw e;
  }
}

export const handlers: Partial<Record<JobType, Handler>> = {
  async CHECK_PROFILE(job: BackgroundJob) {
    await runProfileCheck((job.payload as { profileId: string }).profileId);
  },
  async ANALYZE_AD(job: BackgroundJob) {
    const adId = (job.payload as { adId: string }).adId;
    try {
      await analyzeAd(adId);
    } catch (e) {
      await prisma.advertisement.updateMany({ where: { id: adId }, data: { status: "FAILED", statusError: errMsg(e) } });
      throw e;
    }
  },
  async NOTIFY(job: BackgroundJob) {
    await deliverNotification((job.payload as { notificationId: string }).notificationId);
  },
  async CLEANUP() {
    const cfg = await getConfig();
    const cutoff = new Date(Date.now() - cfg.limits.adRetentionDays * 86400000);
    await prisma.advertisement.deleteMany({ where: { lastSeenAt: { lt: cutoff }, userState: { notIn: ["FAVORITE", "INTERESTING"] }, purchase: null } });
    await prisma.backgroundJob.deleteMany({ where: { status: { in: ["DONE", "FAILED", "DEAD"] }, finishedAt: { lt: new Date(Date.now() - 14 * 86400000) } } });
    await prisma.aiCache.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
    await prisma.marketComparable.deleteMany({ where: { kind: { not: "REALIZED" }, observedAt: { lt: new Date(Date.now() - 365 * 86400000) } } });
  },
};

/** Zet controle-jobs klaar voor profielen die aan de beurt zijn. */
export async function scheduleDueProfiles(now = new Date()): Promise<number> {
  const profiles = await prisma.searchProfile.findMany({ where: { active: true } });
  let n = 0;
  for (const p of profiles) {
    const adapter = adapterForOrigin(p.sourceKind);
    if (!adapter || !adapter.automatic) continue;
    const interval = Math.max(p.intervalMinutes, adapter.minIntervalMinutes);
    if (p.lastCheckedAt && now.getTime() - p.lastCheckedAt.getTime() < interval * 60_000) continue;
    const slot = Math.floor(now.getTime() / (interval * 60_000));
    const r = await enqueue({ type: "CHECK_PROFILE", payload: { profileId: p.id }, priority: p.prioritizeNew ? 15 : 8, uniqueKey: `check:${p.id}:${slot}`, maxAttempts: 3 });
    if (r.created) n++;
  }
  await enqueue({ type: "CLEANUP", payload: {}, priority: 1, uniqueKey: `cleanup:${now.toISOString().slice(0, 10)}`, maxAttempts: 1 });
  return n;
}
