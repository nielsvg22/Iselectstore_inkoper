import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { resetDb, makeUser } from "../helpers";
import { claimNext, completeJob, enqueue, failJob, processJobs, recoverStaleJobs, renewJobLease, type Handler, type JobType } from "@/lib/jobs/queue";
import { jobLanes } from "@/lib/jobs/lanes";
import { runProfileCheck, scheduleDueProfiles } from "@/lib/jobs/handlers";
import { tryMarktplaatsSlot } from "@/lib/sources/request-gate";
import { installApeldoornRadar } from "@/lib/radar/provision";
import { upgradeRadarPolling } from "@/lib/radar/fast-polling";
import { getConfig, saveConfig } from "@/lib/settings/store";
import { clearPageCache } from "@/lib/sources/marktplaats-search";

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));
beforeEach(async () => { await resetDb(); clearPageCache(); vi.unstubAllGlobals(); });
const barrier = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("detectie zonder wachtrijblokkade", () => {
  it("detectie, snelle analyse en push gaan door terwijl detail en volledige AI vaststaan", async () => {
    const release = barrier(); const fullStarted = barrier(); const detailStarted = barrier();
    await enqueue({ type: "ANALYZE_AD", payload: { quick: false } });
    await enqueue({ type: "FETCH_DETAIL", payload: {} });
    const events: string[] = [];
    const handlers: Partial<Record<JobType, Handler>> = {
      ANALYZE_AD: async (job) => {
        if ((job.payload as { quick?: boolean }).quick) events.push("quick");
        else { fullStarted.resolve(); await release.promise; }
      },
      FETCH_DETAIL: async () => { detailStarted.resolve(); await release.promise; },
      CHECK_PROFILE: async () => { events.push("detected"); },
      NOTIFY: async () => { events.push("push"); },
    };
    const lanes = jobLanes(1);
    const blocked = lanes.filter((l) => ["details", "analyse"].includes(l.name))
      .map((l) => processJobs(handlers, { ...l, maxJobs: 1 }));
    try {
      await Promise.all([fullStarted.promise, detailStarted.promise]);
      await enqueue({ type: "CHECK_PROFILE", payload: {} });
      // Bestaande jobs met quick:true blijven compatibel, ook bij een grotere AI-achterstand.
      await enqueue({ type: "ANALYZE_AD", payload: { quick: true } });
      await enqueue({ type: "NOTIFY", payload: {} });
      await Promise.all(lanes.filter((l) => ["detectie", "snel", "push"].includes(l.name))
        .map((l) => processJobs(handlers, { ...l, maxJobs: 1 })));
      expect(events.sort()).toEqual(["detected", "push", "quick"]);
      expect(await prisma.backgroundJob.count({ where: { status: "RUNNING" } })).toBe(2);
    } finally { release.resolve(); await Promise.all(blocked); }
  });

  it("detailrequests reserveren geen toekomstige slots en laten nieuwe zoekjobs voorgaan", async () => {
    const now = Date.now();
    await enqueue({ type: "CHECK_PROFILE", payload: {}, runAt: new Date(now) });
    expect(await tryMarktplaatsSlot(10000, "background", now)).toBe(false);
    expect(await tryMarktplaatsSlot(10000, "discovery", now)).toBe(true);
    expect(await tryMarktplaatsSlot(10000, "background", now + 9999)).toBe(false);
    await prisma.backgroundJob.updateMany({ data: { status: "DONE" } });
    expect(await tryMarktplaatsSlot(10000, "background", now + 10000)).toBe(true);
    const row = await prisma.appSettings.findUniqueOrThrow({ where: { key: "source:marktplaats:next-request" } });
    expect(row.value).toEqual({ at: now + 20000 });
  });

  it("parallelle zoek- en detailrequests delen dezelfde harde pacing", async () => {
    const now = Date.now();
    const claimed = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      tryMarktplaatsSlot(10000, i % 2 ? "discovery" : "background", now)));
    expect(claimed.filter(Boolean)).toHaveLength(1);
  });

  it("herstelt een verlaten claim na één minuut en weigert late wijzigingen van de oude claim", async () => {
    await enqueue({ type: "NOTIFY", payload: {} });
    const old = (await claimNext())!;
    await prisma.backgroundJob.update({ where: { id: old.id }, data: { lockedAt: new Date(Date.now() - 61000) } });
    expect(await recoverStaleJobs()).toBe(1);
    const current = (await claimNext())!;
    expect((await renewJobLease(old)).count).toBe(0);
    await completeJob(old.id, old.attempts); await failJob(old, new Error("late fout"));
    expect((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("RUNNING");
    expect((await renewJobLease(current)).count).toBe(1);
    expect(await recoverStaleJobs()).toBe(0);
    await completeJob(current.id, current.attempts);
  });

  it("een langlopende actieve taak ververst zijn lease tijdens verwerking", async () => {
    const started = barrier(); const release = barrier();
    await enqueue({ type: "NOTIFY", payload: {} });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const running = processJobs({ NOTIFY: async () => { started.resolve(); await release.promise; } }, { maxJobs: 1 });
    try {
      await started.promise;
      await prisma.backgroundJob.updateMany({ data: { lockedAt: new Date(Date.now() - 61000) } });
      await vi.advanceTimersByTimeAsync(10000);
      await vi.waitFor(async () => {
        const job = await prisma.backgroundJob.findFirstOrThrow();
        expect(Date.now() - job.lockedAt!.getTime()).toBeLessThan(5000);
      });
      expect(await recoverStaleJobs()).toBe(0);
    } finally { release.resolve(); await running; vi.useRealTimers(); }
  });

  it("radar vraagt maximaal twee pagina's op, begint breed en wacht niet op koude facetten", async () => {
    const { user } = await makeUser();
    const radar = await installApeldoornRadar(user.id);
    await saveConfig({ limits: { minSecondsBetweenRequests: 0 } });
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const path = new URL(input).pathname;
      if (path === "/robots.txt") return new Response("User-agent: *");
      paths.push(path);
      return new Response(readFileSync("tests/fixtures/mp-search.html", "utf8"));
    });
    await runProfileCheck(radar.id);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe("/q/iphone/");
    expect(paths.every((p) => p.startsWith("/q/"))).toBe(true);
    expect(await prisma.backgroundJob.count({ where: { type: "REFRESH_FACETS" } })).toBeGreaterThan(0);
    await prisma.searchProfile.update({ where: { id: radar.id }, data: { lastCheckedAt: new Date(Date.now() - 31000) } });
    await scheduleDueProfiles();
    expect(await prisma.backgroundJob.count({ where: { type: "CHECK_PROFILE" } })).toBe(1);
  });

  it("versnelt de bestaande radar herstelbaar één keer, zonder andere instellingen te wijzigen", async () => {
    const { user } = await makeUser();
    await installApeldoornRadar(user.id);
    await saveConfig({ scheduler: { fast: { intervalSeconds: 60, maxRequestsPerMinute: 4 } } });
    const before = await getConfig(true);
    expect(await upgradeRadarPolling()).toBe(true);
    expect(await getConfig(true)).toEqual({ ...before, scheduler: { ...before.scheduler,
      fast: { ...before.scheduler.fast, intervalSeconds: 30 } } });
    const backup = await prisma.appSettings.findUniqueOrThrow({ where: { key: "provision:radar-fast-polling-v1" } });
    expect((backup.value as { before: unknown }).before).toEqual(before);
    await saveConfig({ scheduler: { fast: { intervalSeconds: 90 } } });
    expect(await upgradeRadarPolling()).toBe(false);
    expect((await getConfig(true)).scheduler.fast.intervalSeconds).toBe(90);
  });

  it("met warme facetten komt de brede iPhone-pagina vóór de modelslice, ook bij een hoger paginabudget", async () => {
    const { user } = await makeUser(); const radar = await installApeldoornRadar(user.id);
    const category = "telecommunicatie/mobiele-telefoons-apple-iphone";
    const existing = await prisma.searchProfile.findUniqueOrThrow({ where: { id: radar.id } });
    await prisma.searchProfile.update({ where: { id: radar.id }, data: { sourceConfig: {
      ...(existing.sourceConfig as object), queries: ["iphone"],
      sliceModels: ["iphone-15-pro"], sliceStorages: [256],
    } } });
    await prisma.appSettings.create({ data: { key: `facets:${category}`, value: {
      fetchedAt: new Date().toISOString(), models: { iphone15pro: { slug: "iphone-15-pro", id: 14053, label: "iPhone 15 Pro" } },
      storages: { "256gb": { slug: "256-gb", id: 12825, label: "256 GB" } },
    } } });
    await saveConfig({ scheduler: { fast: { pages: 8 } }, limits: { minSecondsBetweenRequests: 0 } });
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const path = new URL(input).pathname;
      if (path === "/robots.txt") return new Response("User-agent: *");
      paths.push(path); return new Response(readFileSync("tests/fixtures/mp-search.html", "utf8"));
    });
    await runProfileCheck(radar.id);
    expect(paths).toEqual(["/q/iphone/", `/l/${category}/f/256-gb+iphone-15-pro/12825+14053/`]);
  });

  it("respecteert een al bewust gekozen afwijkend interval", async () => {
    const { user } = await makeUser(); await installApeldoornRadar(user.id);
    await saveConfig({ scheduler: { fast: { intervalSeconds: 120 } } });
    expect(await upgradeRadarPolling()).toBe(false);
    expect((await getConfig(true)).scheduler.fast.intervalSeconds).toBe(120);
  });
});
