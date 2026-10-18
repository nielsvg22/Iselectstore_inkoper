import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { getPerformance } from "@/lib/metrics";
import { ingestAd } from "@/lib/pipeline/ingest";
import { installApeldoornRadar } from "@/lib/radar/provision";
import { saveConfig, setSecret } from "@/lib/settings/store";
import { officialAdapter, officialGateState, officialReady, OFFICIAL_SOURCE, parseOfficialResults } from "@/lib/sources/marktplaats-official";
import { handlers, runProfileCheck, scheduleDueProfiles } from "@/lib/jobs/handlers";
import { processJobs } from "@/lib/jobs/queue";
import { deliverNotification } from "@/lib/notify/dispatch";
import { setPrefs } from "@/lib/notify/prefs";
import { makeUser, resetDb } from "../helpers";

const envelope = { _embedded: { "mp:search-result": [{ itemId: "m999000001", title: "iPhone 16 Pro 256GB", priceModel: { askingPrice: 42000 } }] } };
const ctx = { profileId: "p", query: "iphone", config: {}, maxAds: 100 };
async function enable() {
  await saveConfig({ officialApi: { enabled: true, accessApproved: true }, sources: { allowed: ["SEARCH", "PARTNER_API"] } });
  await setSecret("marktplaats.accessToken", "test-only-oauth-token");
}
beforeEach(async () => { await resetDb(); vi.unstubAllGlobals(); });

describe("separate official source is opt-in and fails closed", () => {
  it("does not make requests without approved access and token", async () => {
    const fetcher = vi.fn();
    expect(await officialReady()).toBe(false);
    await expect(officialAdapter.fetchProfile({ ...ctx, fetchImpl: fetcher })).rejects.toThrow(/staat uit/);
    await saveConfig({ officialApi: { enabled: true, accessApproved: true } });
    await expect(officialAdapter.fetchProfile({ ...ctx, fetchImpl: fetcher })).rejects.toThrow(/OAuth-token/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403])("permanently pauses the same credential after HTTP %i", async status => {
    await enable(); const fetcher = vi.fn(async () => new Response("private body", { status }));
    await expect(officialAdapter.fetchProfile({ ...ctx, fetchImpl: fetcher })).rejects.toThrow(`HTTP ${status}`);
    expect(await officialReady()).toBe(false);
    // Even after elapsed pacing time, this credential cannot keep retrying.
    const key = `source:${OFFICIAL_SOURCE}:gate`;
    const gate = await officialGateState();
    await prisma.appSettings.update({ where: { key }, data: { value: { ...gate, nextAt: 0 } } });
    await expect(officialAdapter.fetchProfile({ ...ctx, fetchImpl: fetcher })).rejects.toThrow(/gepauzeerd/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await setSecret("marktplaats.accessToken", "replacement-test-token");
    expect(await officialReady()).toBe(true);
    expect(JSON.stringify(gate)).not.toContain("test-only-oauth-token");
  });
  it("respects Retry-After and serialises parallel API requests across the DB", async () => {
    await enable(); const fetcher = vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "3600" } }));
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => officialAdapter.fetchProfile({ ...ctx, fetchImpl: fetcher })));
    expect(results.every(r => r.status === "rejected")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await officialGateState()).nextAt).toBeGreaterThanOrEqual(Date.now() + 3590_000);
    expect(await officialReady()).toBe(false);
  });
  it("schedules both sources under the same profile, with isolated check history", async () => {
    const { user } = await makeUser(); const radar = await installApeldoornRadar(user.id);
    await enable(); await scheduleDueProfiles(); await scheduleDueProfiles();
    expect(await prisma.searchProfile.count({ where: { active: true } })).toBe(1);
    expect(await prisma.backgroundJob.count({ where: { type: "CHECK_OFFICIAL_PROFILE", status: "PENDING" } })).toBe(1);
    const before = await prisma.searchProfile.findUniqueOrThrow({ where: { id: radar.id } });
    vi.stubGlobal("fetch", async () => Response.json(envelope));
    await runProfileCheck(radar.id, true);
    const run = await prisma.checkRun.findFirstOrThrow(); expect(run.sourceId).toBe(OFFICIAL_SOURCE);
    expect(run.created).toBe(1); expect(run.ok).toBe(true);
    const after = await prisma.searchProfile.findUniqueOrThrow({ where: { id: radar.id } });
    expect(after.lastCheckedAt).toEqual(before.lastCheckedAt); // HTML schedule is independent
    expect(await prisma.backgroundJob.count({ where: { type: "FETCH_DETAIL" } })).toBe(1);
  });
});

describe("shared incremental ingestion", () => {
  it("one ad, price-history entry and analysis job for simultaneous discoveries", async () => {
    const [raw] = parseOfficialResults(envelope);
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => ingestAd({ ...raw, externalId: i % 2 ? " M999000001 " : raw.externalId }, { origin: i % 2 ? "SEARCH" : "PARTNER_API", partial: true })));
    expect(results.filter(r => r.created)).toHaveLength(1);
    expect(new Set(results.map(r => r.adId)).size).toBe(1);
    expect(await prisma.advertisement.count()).toBe(1);
    expect(await prisma.priceHistory.count()).toBe(1);
    expect(await prisma.backgroundJob.count({ where: { type: "ANALYZE_AD" } })).toBe(1);
  });
  it("preserves known facts and exact publication timestamps when summaries lack data", async () => {
    const [raw] = parseOfficialResults(envelope);
    const published = new Date(Date.now() - 45000);
    const first = await ingestAd({ ...raw, distanceKm: 8, location: "Apeldoorn", publishedAt: published,
      attributes: { publicationPrecision: "exact", detectionSource: "marktplaats-search" },
      seller: { id: "42", name: "Seller", rating: 4.8, reviewCount: 20, accountAgeMonths: 24 }, shipping: ["shipping"] }, { origin: "SEARCH", partial: true });
    await ingestAd({ ...raw, seller: { id: "42" }, publishedAt: new Date(), attributes: { publicationPrecision: "day", detectionSource: OFFICIAL_SOURCE }, askingCents: undefined }, { origin: "PARTNER_API", partial: true });
    const saved = await prisma.advertisement.findUniqueOrThrow({ where: { id: first.adId } });
    expect(saved.distanceKm).toBe(8); expect(saved.location).toBe("Apeldoorn"); expect(saved.askingPriceCents).toBe(42000);
    expect(saved.publishedAt).toEqual(published); expect(saved.sellerName).toBe("Seller");
    expect(saved.sellerSignals).toMatchObject({ rating: 4.8, reviewCount: 20, accountAgeMonths: 24 });
    expect(saved.rawPayload).toMatchObject({ attributes: { publicationPrecision: "exact", firstDetectionSource: "marktplaats-search" } });
    expect(saved.shippingOptions).toEqual(["shipping"]);
  });
  it("does not carry reputation to a different seller", async () => {
    const [raw] = parseOfficialResults(envelope);
    await ingestAd({ ...raw, seller: { id: "a", rating: 5, reviewCount: 50, accountAgeMonths: 48, verified: true } }, { origin: "SEARCH", partial: true });
    const r = await ingestAd({ ...raw, seller: { id: "b" } }, { origin: "PARTNER_API", partial: true });
    const saved = await prisma.advertisement.findUniqueOrThrow({ where: { id: r.adId } });
    expect(saved.sellerSignals).toMatchObject({ rating: null, reviewCount: null, accountAgeMonths: null });
    expect(saved.sellerVerified).toBeNull();
  });
  it("deduplicated parallel API/HTML discovery produces one preliminary push without AI or details", async () => {
    const { user } = await makeUser(); const p = await installApeldoornRadar(user.id);
    const profile = await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } });
    await prisma.searchProfile.update({ where: { id: p.id }, data: { sourceConfig: { ...(profile.sourceConfig as object), baselineAt: new Date(Date.now() - 60000).toISOString() } } });
    await setPrefs(user.id, { mode: "all", minScore: null, minProfitEuro: null });
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/test", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
    const [raw] = parseOfficialResults(envelope);
    await Promise.all(["SEARCH", "PARTNER_API"].map(origin => ingestAd(raw, { origin: origin as "SEARCH" | "PARTNER_API", partial: true })));
    const payloads: string[] = [];
    await processJobs({ ...handlers, NOTIFY: async job => {
      await deliverNotification((job.payload as { notificationId: string }).notificationId, undefined,
        { push: async (_sub, payload) => { payloads.push(payload); return { statusCode: 201 }; } });
    } }, { types: ["ANALYZE_AD", "NOTIFY"], maxJobs: 20, concurrency: 1 });
    expect(payloads).toHaveLength(1); expect(JSON.parse(payloads[0]).provisional).toBe(true);
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", status: "SENT" } })).toBe(1);
  });
});

describe("real speed metrics", () => {
  it("separates source cadence, excludes imprecise publication dates and Telegram push latency", async () => {
    const now = Date.now();
    await prisma.checkRun.createMany({ data: [0, 30, 60].map((s, i) => ({ profileId: "p", sourceId: OFFICIAL_SOURCE, startedAt: new Date(now - (90 - s) * 1000), finishedAt: new Date(now - (89 - s) * 1000), ok: true, created: i })) });
    const [raw] = parseOfficialResults(envelope);
    await ingestAd({ ...raw, publishedAt: new Date(now - 45000), attributes: { publicationPrecision: "exact" } }, { origin: "SEARCH", enqueueAnalysis: false });
    await ingestAd({ ...raw, externalId: "m999000002", publishedAt: new Date(now - 3600_000), attributes: { publicationPrecision: "day" } }, { origin: "SEARCH", enqueueAnalysis: false });
    const perf = await getPerformance();
    expect(perf.latency.publicationToDetection.n).toBe(1); expect(perf.latency.publicationToDetection.avg).toBeCloseTo(45, 0);
    const source = perf.sources.find(s => s.id === OFFICIAL_SOURCE)!;
    expect(source.scanInterval.avg).toBe(30); expect(source.discovered).toBe(3);
    expect(perf.sources.find(s => s.id === "marktplaats-search")!.scanInterval.n).toBe(0);
  });
});
