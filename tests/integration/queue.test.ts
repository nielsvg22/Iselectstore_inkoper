import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { claimNext, enqueue, failJob, PermanentJobError, processJobs, recoverStaleJobs } from "@/lib/jobs/queue";
import { scheduleDueProfiles } from "@/lib/jobs/handlers";
import { makeUser, resetDb } from "../helpers";

beforeEach(resetDb);

describe("jobwachtrij", () => {
  it("is idempotent via uniqueKey", async () => {
    const a = await enqueue({ type: "ANALYZE_AD", payload: { adId: "x" }, uniqueKey: "k1" });
    const b = await enqueue({ type: "ANALYZE_AD", payload: { adId: "x" }, uniqueKey: "k1" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
    const results = await Promise.all([1, 2, 3, 4].map(() => enqueue({ type: "NOTIFY", payload: {}, uniqueKey: "race" })));
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it("claimt op prioriteit en geeft elke job maar aan één worker", async () => {
    await enqueue({ type: "ANALYZE_AD", payload: { n: 1 }, priority: 1 });
    await enqueue({ type: "ANALYZE_AD", payload: { n: 2 }, priority: 10 });
    await enqueue({ type: "ANALYZE_AD", payload: { n: 3 }, priority: 5 });
    const claims = await Promise.all([claimNext(), claimNext(), claimNext(), claimNext()]);
    const got = claims.filter(Boolean);
    expect(got).toHaveLength(3);
    expect(new Set(got.map((j) => j!.id)).size).toBe(3);
    expect(got.every((j) => j!.status === "RUNNING" && j!.attempts === 1)).toBe(true);
  });

  it("toekomstige jobs worden niet geclaimd", async () => {
    await enqueue({ type: "NOTIFY", payload: {}, runAt: new Date(Date.now() + 60_000) });
    expect(await claimNext()).toBeNull();
  });

  it("probeert opnieuw met backoff en eindigt als DEAD na maxAttempts", async () => {
    await enqueue({ type: "NOTIFY", payload: {}, maxAttempts: 2 });
    const j1 = (await claimNext())!;
    await failJob(j1, new Error("tijdelijk"));
    const afterFirst = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: j1.id } });
    expect(afterFirst.status).toBe("PENDING");
    expect(afterFirst.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    await prisma.backgroundJob.update({ where: { id: j1.id }, data: { runAt: new Date() } });
    const j2 = (await claimNext())!;
    await failJob(j2, new Error("nog steeds"));
    expect((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: j1.id } })).status).toBe("DEAD");
  });

  it("permanente fouten worden niet herhaald", async () => {
    await enqueue({ type: "NOTIFY", payload: {} });
    const j = (await claimNext())!;
    await failJob(j, new PermanentJobError("config ontbreekt"));
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: j.id } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("config");
  });

  it("herstelt vastgelopen jobs", async () => {
    await enqueue({ type: "NOTIFY", payload: {} });
    const j = (await claimNext())!;
    await prisma.backgroundJob.update({ where: { id: j.id }, data: { lockedAt: new Date(Date.now() - 30 * 60_000) } });
    expect(await recoverStaleJobs()).toBe(1);
    expect((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("PENDING");
  });

  it("processJobs registreert fouten en gaat door met volgende jobs", async () => {
    await enqueue({ type: "ANALYZE_AD", payload: {}, priority: 2 });
    await enqueue({ type: "NOTIFY", payload: {}, priority: 1 });
    let ran = 0;
    const r = await processJobs({ ANALYZE_AD: async () => { throw new Error("kapot"); }, NOTIFY: async () => { ran++; } }, { maxJobs: 5 });
    expect(r).toEqual({ processed: 2, failed: 1 });
    expect(ran).toBe(1);
  });

  it("plant alleen profielen die aan de beurt zijn, eenmalig per tijdslot", async () => {
    const { user } = await makeUser();
    const due = await prisma.searchProfile.create({ data: { userId: user.id, name: "due", sourceKind: "FEED", intervalMinutes: 15 } });
    await prisma.searchProfile.create({ data: { userId: user.id, name: "recent", sourceKind: "FEED", intervalMinutes: 60, lastCheckedAt: new Date() } });
    await prisma.searchProfile.create({ data: { userId: user.id, name: "inactief", sourceKind: "FEED", active: false } });
    await prisma.searchProfile.create({ data: { userId: user.id, name: "demo", sourceKind: "DEMO" } });
    expect(await scheduleDueProfiles()).toBe(1);
    expect(await scheduleDueProfiles()).toBe(0);
    const job = await prisma.backgroundJob.findFirstOrThrow({ where: { type: "CHECK_PROFILE" } });
    expect((job.payload as { profileId: string }).profileId).toBe(due.id);
  });

  it("respecteert de minimale bron-interval boven het profielinterval", async () => {
    const { user } = await makeUser();
    // MANUAL_URL heeft minIntervalMinutes 30; profiel vraagt 5 minuten maar is 10 minuten geleden gecontroleerd
    await prisma.searchProfile.create({ data: { userId: user.id, name: "snel", sourceKind: "MANUAL_URL", intervalMinutes: 5, lastCheckedAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await scheduleDueProfiles()).toBe(0);
  });
});
