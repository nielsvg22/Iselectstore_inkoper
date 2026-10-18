import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveConfig } from "@/lib/settings/store";
import { installApeldoornRadar } from "@/lib/radar/provision";
import { runProfileCheck, handlers } from "@/lib/jobs/handlers";
import { processJobs } from "@/lib/jobs/queue";
import { deliverNotification } from "@/lib/notify/dispatch";
import { clearPageCache } from "@/lib/sources/marktplaats-search";
import { makeUser, resetDb } from "../helpers";

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));
beforeEach(async () => { await resetDb(); clearPageCache(); vi.unstubAllGlobals(); });
async function setup(queries = ["iphone"], rpm = 12) {
  const { user } = await makeUser(); const p = await installApeldoornRadar(user.id);
  const profile = await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } });
  await prisma.searchProfile.update({ where: { id: p.id }, data: { sourceConfig: { ...(profile.sourceConfig as object),
    queries, baselineAt: new Date(Date.now() - 3600000).toISOString(), fetchDetails: false } } });
  await saveConfig({ scheduler: { fast: { recentWindowMinutes: 5, maxRequestsPerMinute: rpm, intervalSeconds: 30 } },
    limits: { minSecondsBetweenRequests: 0 } });
  return { user, profileId: p.id };
}

/** Explicitly synthetic records, only in the isolated test DB. */
function page(total: number, number: number, since: string | null, offset = 0) {
  const start = (number - 1) * 30;
  const listings = Array.from({ length: Math.max(0, Math.min(30, total - start)) }, (_, i) => ({
    itemId: `m9900${String(offset + start + i).padStart(6, "0")}`,
    title: `iPhone 16 Pro 256GB contracttest ${start + i}`, description: "Apple telefoon",
    vipUrl: `/v/test/m9900${String(offset + start + i).padStart(6, "0")}-iphone`,
    priceInfo: { priceCents: 30000 + i * 101, priceType: "FIXED" },
    location: { cityName: "Apeldoorn", latitude: 52.2112, longitude: 5.9699 },
    date: "Vandaag", imageUrls: [], priorityProduct: "NONE",
  }));
  return `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { searchRequestAndResponse: {
    listings, totalResultCount: total, maxAllowedPageNumber: Math.max(1, Math.ceil(total / 30)),
    searchRequest: { attributesByKey: since === null ? [] : [{ attributeKey: "offeredSince", attributeValueKey: since }] },
  } } } })}</script>`;
}
function stub(total = 1, ignored = false) {
  const requests: Array<{ page: number; since: string; query: string }> = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const u = new URL(input);
    if (u.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /lrp/api/search*\nDisallow: */n/*");
    const since = /\/ta\/offeredSince\/(\d+)\//.exec(u.pathname)?.[1];
    if (!since) throw new Error("Expected a public date-filtered path");
    const number = Number(/\/p\/(\d+)\//.exec(u.pathname)?.[1] ?? 1);
    const query = /\/q\/([^/]+)\//.exec(u.pathname)?.[1] ?? "";
    requests.push({ page: number, since, query });
    return new Response(page(total, number, ignored ? null : since));
  });
  return requests;
}

describe("recent public HTML discovery", () => {
  it("streams recent results to one preliminary push before details/AI", async () => {
    const { user, profileId } = await setup();
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/recent", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
    const requests = stub(); const started = Date.now();
    await runProfileCheck(profileId);
    const calls: string[] = [];
    await processJobs({ ...handlers, NOTIFY: async job => {
      await deliverNotification((job.payload as { notificationId: string }).notificationId, undefined,
        { push: async (_sub, payload) => { calls.push(payload); return { statusCode: 201 }; } });
    } }, { types: ["ANALYZE_AD", "NOTIFY"], maxJobs: 20, concurrency: 1 });
    expect(calls).toHaveLength(1); expect(JSON.parse(calls[0]).provisional).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000); // local mocked transport, not iPhone/publication proof
    const ad = await prisma.advertisement.findFirstOrThrow();
    expect(ad.rawPayload).toMatchObject({ attributes: { discoveryWindowVerified: 1, publicationPrecision: "day" } });
    expect(requests[0].since).toMatch(/^\d{13}$/);
    clearPageCache();
    await runProfileCheck(profileId); // a later fresh request must not notify twice
    expect(requests.map(r => r.page)).toEqual([1, 1]);
    await processJobs(handlers, { types: ["ANALYZE_AD"], maxJobs: 20 });
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH" } })).toBe(1);
  });
  it("processes every page of a burst that fits the existing budget", async () => {
    const { profileId } = await setup(); const requests = stub(150);
    const result = await runProfileCheck(profileId);
    expect(result.created).toBe(150); expect(requests.map(r => r.page)).toEqual([1, 2, 3, 4, 5]);
    const state = (await prisma.appSettings.findUniqueOrThrow({ where: { key: `slice:state:${profileId}` } })).value;
    expect(state).toMatchObject({ "q:iphone": { complete: true, nextPage: 1 } });
  });
  it("resumes after budget exhaustion while revisiting the first page for new arrivals", async () => {
    const { profileId } = await setup(["iphone"], 6); const requests = stub(95);
    await runProfileCheck(profileId);
    expect(requests.map(r => r.page)).toEqual([1, 2]);
    const since = requests[0].since;
    clearPageCache(); await runProfileCheck(profileId);
    expect(requests.slice(2).map(r => r.page)).toEqual([1, 3]);
    clearPageCache(); await runProfileCheck(profileId);
    expect(requests.slice(4).map(r => r.page)).toEqual([1, 4]);
    expect(requests.every(r => r.since === since)).toBe(true);
    expect(await prisma.advertisement.count()).toBe(95);
    const state = (await prisma.appSettings.findUniqueOrThrow({ where: { key: `slice:state:${profileId}` } })).value;
    expect(state).toMatchObject({ "q:iphone": { complete: true, nextPage: 1 } });
  });
  it("makes progress at a one-page budget rather than permanently missing page two", async () => {
    const { profileId } = await setup(["iphone"], 3); const requests = stub(45);
    await runProfileCheck(profileId); clearPageCache(); await runProfileCheck(profileId);
    expect(requests.map(r => r.page)).toEqual([1, 2]);
    expect(await prisma.advertisement.count()).toBe(45);
  });
  it("refuses to silently accept an ignored date window", async () => {
    const { profileId } = await setup(); stub(1, true);
    await expect(runProfileCheck(profileId)).rejects.toThrow(/tijdvenster niet aantoonbaar/);
    expect(await prisma.advertisement.count()).toBe(0);
    const profile = await prisma.searchProfile.findUniqueOrThrow({ where: { id: profileId } });
    expect(profile.lastError).toContain("tijdvenster");
  });
  it("stores earlier query progress even if a later query fails", async () => {
    const { profileId } = await setup(["iphone", "ipad"]);
    const requests = stub(); const fetcher = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string) => input.includes("/q/ipad/") ? new Response("", { status: 500 }) : fetcher(input));
    await expect(runProfileCheck(profileId)).rejects.toThrow(/500/);
    expect(requests).toHaveLength(1);
    const state = (await prisma.appSettings.findUniqueOrThrow({ where: { key: `slice:state:${profileId}` } })).value;
    expect(state).toMatchObject({ "q:iphone": { complete: true } });
  });
  it("covers all five broad families in one normal-budget round without cold facet requests", async () => {
    const { profileId } = await setup(["iphone", "macbook", "ipad", "apple watch", "airpods"]);
    const requests = stub(0);
    await runProfileCheck(profileId);
    expect(requests.map(r => r.query)).toEqual(["iphone", "macbook", "ipad", "apple+watch", "airpods"]);
    expect(await prisma.backgroundJob.count({ where: { type: "REFRESH_FACETS" } })).toBe(0);
  });
});
