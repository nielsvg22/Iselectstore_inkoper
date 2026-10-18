import { Prisma, type BackgroundJob } from "@prisma/client";
import { prisma } from "../db/client";
import { errMsg, log } from "../log";

export type JobType = "CHECK_PROFILE" | "CHECK_OFFICIAL_PROFILE" | "FETCH_DETAIL" | "REFRESH_FACETS" | "ANALYZE_AD" | "NOTIFY" | "CLEANUP";
export type AnalysisMode = "quick" | "full";

export interface EnqueueOpts {
  type: JobType;
  payload: Record<string, unknown>;
  priority?: number;
  runAt?: Date;
  uniqueKey?: string;
  maxAttempts?: number;
}

/** Idempotent: bestaat de uniqueKey al, dan wordt niets toegevoegd. */
export async function enqueue(o: EnqueueOpts): Promise<{ id: string; created: boolean }> {
  if (o.uniqueKey) {
    const existing = await prisma.backgroundJob.findUnique({ where: { uniqueKey: o.uniqueKey }, select: { id: true } });
    if (existing) return { id: existing.id, created: false };
  }
  try {
    const j = await prisma.backgroundJob.create({
      data: { type: o.type, payload: o.payload as Prisma.InputJsonValue, priority: o.priority ?? 0, runAt: o.runAt ?? new Date(), uniqueKey: o.uniqueKey, maxAttempts: o.maxAttempts ?? 4 },
    });
    return { id: j.id, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && o.uniqueKey) {
      const ex = await prisma.backgroundJob.findUnique({ where: { uniqueKey: o.uniqueKey }, select: { id: true } });
      return { id: ex!.id, created: false };
    }
    throw e;
  }
}

/** Atomisch claimen (FOR UPDATE SKIP LOCKED) zodat meerdere workers elkaar niet in de weg zitten. */
export async function claimNext(types?: JobType[], analysisMode?: AnalysisMode): Promise<BackgroundJob | null> {
  const typeFilter = types?.length ? Prisma.sql`AND "type" IN (${Prisma.join(types)})` : Prisma.empty;
  // Houd bestaande ANALYZE_AD-jobs compatibel; een trage AI-job mag geen snelle analyse bezetten.
  const analysisFilter = analysisMode === "quick"
    ? Prisma.sql`AND "type" = 'ANALYZE_AD' AND "payload"->'quick' = 'true'::jsonb`
    : analysisMode === "full"
      ? Prisma.sql`AND NOT ("type" = 'ANALYZE_AD' AND COALESCE("payload"->'quick' = 'true'::jsonb, false))`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<BackgroundJob[]>(Prisma.sql`
    UPDATE "BackgroundJob" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "BackgroundJob"
      WHERE "status" = 'PENDING' AND "runAt" <= now() ${typeFilter} ${analysisFilter}
      ORDER BY "priority" DESC, "runAt" ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING *`);
  return rows[0] ?? null;
}

export async function completeJob(id: string, attempts?: number) {
  await prisma.backgroundJob.updateMany({ where: { id, ...(attempts === undefined ? {} : { attempts, status: "RUNNING" }) }, data: { status: "DONE", finishedAt: new Date(), lockedAt: null, lastError: null } });
}

/** Alleen de huidige claim mag zijn lease verlengen of het resultaat vastleggen. */
export async function renewJobLease(job: BackgroundJob) {
  return prisma.backgroundJob.updateMany({ where: { id: job.id, attempts: job.attempts, status: "RUNNING" }, data: { lockedAt: new Date() } });
}

export class PermanentJobError extends Error {}

export async function failJob(job: BackgroundJob, err: unknown) {
  const permanent = err instanceof PermanentJobError;
  const msg = errMsg(err);
  if (permanent || job.attempts >= job.maxAttempts) {
    await prisma.backgroundJob.updateMany({ where: { id: job.id, attempts: job.attempts, status: "RUNNING" }, data: { status: permanent ? "FAILED" : "DEAD", lastError: msg, finishedAt: new Date(), lockedAt: null } });
    return;
  }
  const delaySec = Math.min(3600, 30 * 2 ** (job.attempts - 1));
  await prisma.backgroundJob.updateMany({ where: { id: job.id, attempts: job.attempts, status: "RUNNING" }, data: { status: "PENDING", lastError: msg, lockedAt: null, runAt: new Date(Date.now() + delaySec * 1000) } });
}

export async function recoverStaleJobs(olderThanMs = 60_000): Promise<number> {
  const r = await prisma.backgroundJob.updateMany({ where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } }, data: { status: "PENDING", lockedAt: null } });
  return r.count;
}

export type Handler = (job: BackgroundJob) => Promise<void>;

/**
 * Verwerkt jobs met `concurrency` parallelle lopers. Elke loper claimt atomisch (SKIP LOCKED),
 * dus meerdere lopers/workers claimen nooit dezelfde job.
 */
export async function processJobs(handlers: Partial<Record<JobType, Handler>>, opts: { maxJobs: number; deadlineMs?: number; types?: JobType[]; concurrency?: number; analysisMode?: AnalysisMode }): Promise<{ processed: number; failed: number }> {
  const deadline = Date.now() + (opts.deadlineMs ?? 50_000);
  const totals = { processed: 0, failed: 0 };
  await recoverStaleJobs();
  const runner = async () => {
    while (totals.processed < opts.maxJobs && Date.now() < deadline) {
      totals.processed++; // reserveer een plek vóór het claimen zodat maxJobs niet wordt overschreden
      const job = await claimNext(opts.types, opts.analysisMode);
      if (!job) {
        totals.processed--;
        break;
      }
      const ok = await runJob(job, handlers);
      if (!ok) totals.failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, runner));
  return totals;
}

async function runJob(job: BackgroundJob, handlers: Partial<Record<JobType, Handler>>): Promise<boolean> {
  const h = handlers[job.type as JobType];
  const lease = setInterval(() => {
    void renewJobLease(job).catch((e) => log("warn", "Job-lease verlengen mislukt", { id: job.id, error: errMsg(e) }));
  }, 10_000);
  lease.unref();
  try {
    if (!h) throw new PermanentJobError(`Geen handler voor ${job.type}`);
    await h(job);
    await completeJob(job.id, job.attempts);
    return true;
  } catch (e) {
    log("warn", "Job mislukt", { id: job.id, type: job.type, attempt: job.attempts, error: errMsg(e) });
    await failJob(job, e);
    return false;
  } finally {
    clearInterval(lease);
  }
}
