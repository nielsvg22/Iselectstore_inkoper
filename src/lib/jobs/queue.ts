import { Prisma, type BackgroundJob } from "@prisma/client";
import { prisma } from "../db/client";
import { errMsg, log } from "../log";

export type JobType = "CHECK_PROFILE" | "ANALYZE_AD" | "NOTIFY" | "CLEANUP";

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
export async function claimNext(types?: JobType[]): Promise<BackgroundJob | null> {
  const typeFilter = types?.length ? Prisma.sql`AND "type" IN (${Prisma.join(types)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<BackgroundJob[]>(Prisma.sql`
    UPDATE "BackgroundJob" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "BackgroundJob"
      WHERE "status" = 'PENDING' AND "runAt" <= now() ${typeFilter}
      ORDER BY "priority" DESC, "runAt" ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING *`);
  return rows[0] ?? null;
}

export async function completeJob(id: string) {
  await prisma.backgroundJob.update({ where: { id }, data: { status: "DONE", finishedAt: new Date(), lockedAt: null, lastError: null } });
}

export class PermanentJobError extends Error {}

export async function failJob(job: BackgroundJob, err: unknown) {
  const permanent = err instanceof PermanentJobError;
  const msg = errMsg(err);
  if (permanent || job.attempts >= job.maxAttempts) {
    await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: permanent ? "FAILED" : "DEAD", lastError: msg, finishedAt: new Date(), lockedAt: null } });
    return;
  }
  const delaySec = Math.min(3600, 30 * 2 ** (job.attempts - 1));
  await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "PENDING", lastError: msg, lockedAt: null, runAt: new Date(Date.now() + delaySec * 1000) } });
}

export async function recoverStaleJobs(olderThanMs = 10 * 60_000): Promise<number> {
  const r = await prisma.backgroundJob.updateMany({ where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } }, data: { status: "PENDING", lockedAt: null } });
  return r.count;
}

export type Handler = (job: BackgroundJob) => Promise<void>;

export async function processJobs(handlers: Partial<Record<JobType, Handler>>, opts: { maxJobs: number; deadlineMs?: number; types?: JobType[] }): Promise<{ processed: number; failed: number }> {
  const deadline = Date.now() + (opts.deadlineMs ?? 50_000);
  let processed = 0;
  let failed = 0;
  await recoverStaleJobs();
  while (processed < opts.maxJobs && Date.now() < deadline) {
    const job = await claimNext(opts.types);
    if (!job) break;
    const h = handlers[job.type as JobType];
    try {
      if (!h) throw new PermanentJobError(`Geen handler voor ${job.type}`);
      await h(job);
      await completeJob(job.id);
    } catch (e) {
      failed++;
      log("warn", "Job mislukt", { id: job.id, type: job.type, attempt: job.attempts, error: errMsg(e) });
      await failJob(job, e);
    }
    processed++;
  }
  return { processed, failed };
}
