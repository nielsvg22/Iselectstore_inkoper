import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { ingestAd } from "@/lib/pipeline/ingest";
import { saveTree } from "@/lib/pipeline/tree";
import { deliverNotification } from "@/lib/notify/dispatch";
import { processJobs } from "@/lib/jobs/queue";
import { handlers, runProfileCheck, scheduleDueProfiles, runDetailFetch } from "@/lib/jobs/handlers";
import { getCooldown } from "@/lib/jobs/cooldown";
import { saveConfig } from "@/lib/settings/store";
import { clearPageCache } from "@/lib/sources/marktplaats-search";
import type { PushSender } from "@/lib/notify/push";
import type { RawAd } from "@/lib/sources/types";
import { makeUser, resetDb } from "../helpers";

vi.mock("node:dns/promises", () => ({ default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }, lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

const raw = (o: Partial<RawAd> = {}): RawAd => ({
  externalId: "m3000001", url: "https://www.marktplaats.nl/v/x/m3000001-iphone", title: "iPhone 15 Pro 256GB", description: "Batterij 91%. iCloud vrij, simlockvrij. Mooi toestel zonder krassen, incl. oplader en doos.",
  askingCents: 30000, location: "Utrecht", distanceKm: 20, imageUrls: ["https://img.example/1.jpg", "https://img.example/2.jpg", "https://img.example/3.jpg"], shipping: ["pickup", "shipping"], publishedAt: new Date(), ...o,
});

async function profile(userId: string, fastMode: boolean, extra: Record<string, unknown> = {}) {
  const p = await prisma.searchProfile.create({ data: { userId, name: fastMode ? "Snel" : "Normaal", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: [], intervalMinutes: 10, sourceConfig: { queries: ["iphone 15 pro"], fastMode, maxPages: 3, baselineAt: new Date(Date.now() - 3600_000).toISOString(), ...extra } } });
  await saveTree(p.id, { op: "AND", children: [] });
  return p;
}
async function comps() {
  await prisma.marketComparable.createMany({ data: [700, 690, 710, 705, 695, 715, 702, 698].map((p, i) => ({ modelKey: "iphone-15-pro", storageGb: 256, priceCents: p * 100, kind: i < 2 ? ("REALIZED" as const) : ("ASKING_CURRENT" as const), observedAt: new Date(Date.now() - i * 86400000) })) });
}
const jobsFor = (id: string) => prisma.backgroundJob.findMany({ where: { type: "CHECK_PROFILE", payload: { path: ["profileId"], equals: id } } });

beforeEach(async () => {
  await resetDb();
  vi.unstubAllGlobals();
  clearPageCache();
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 } });
});

describe("snelle modus: planning", () => {
  it("snel profiel elke ±60 s, normaal profiel elke 10 min; zonder globale schakelaar geen snelle modus", async () => {
    const { user } = await makeUser();
    const fast = await profile(user.id, true);
    const slow = await profile(user.id, false);
    const ago = (s: number) => new Date(Date.now() - s * 1000);
    await prisma.searchProfile.updateMany({ data: { lastCheckedAt: ago(70) } });

    await scheduleDueProfiles(); // globaal uit: beide wachten op 10 minuten
    expect((await jobsFor(fast.id)).length + (await jobsFor(slow.id)).length).toBe(0);

    await saveConfig({ scheduler: { fast: { enabled: true } } });
    await scheduleDueProfiles();
    expect((await jobsFor(fast.id)).length).toBe(1);
    expect((await jobsFor(fast.id))[0].priority).toBe(28); // detectie gaat voor detailpagina's
    expect((await jobsFor(slow.id)).length).toBe(0);

    await prisma.searchProfile.update({ where: { id: fast.id }, data: { lastCheckedAt: ago(30) } });
    await prisma.backgroundJob.deleteMany();
    await scheduleDueProfiles();
    expect((await jobsFor(fast.id)).length).toBe(0); // nog geen minuut geleden

    await prisma.searchProfile.update({ where: { id: slow.id }, data: { lastCheckedAt: ago(11 * 60) } });
    await scheduleDueProfiles();
    expect((await jobsFor(slow.id)).length).toBe(1);
  });

  it("totaalrem: nooit meer dan het ingestelde aantal pagina-requests per minuut", async () => {
    const { user } = await makeUser();
    await saveConfig({ scheduler: { fast: { enabled: true, maxRequestsPerMinute: 2, pages: 2 } } });
    const ps = [await profile(user.id, true), await profile(user.id, true), await profile(user.id, true)];
    const n = await scheduleDueProfiles();
    expect(n).toBeLessThan(3); // budget 2 requests, elk profiel kost 2 pagina's
    expect(n).toBeGreaterThanOrEqual(1);
    expect(ps.length).toBe(3);
  });
});

describe("snelle modus: blokkade (403/429) wordt gerespecteerd", () => {
  it("pauzeert met oplopende wachttijd, plant niets tijdens de pauze en omzeilt niets", async () => {
    const { user } = await makeUser();
    await saveConfig({ scheduler: { fast: { enabled: true } } });
    const p = await profile(user.id, true);
    let hits = 0;
    vi.stubGlobal("fetch", async (u: string) => {
      const url = new URL(u);
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /lrp/api/search*");
      hits++;
      return new Response("Too many requests", { status: 429 });
    });
    await expect(runProfileCheck(p.id)).rejects.toThrow(/429/);
    const cd = await getCooldown("marktplaats-search");
    expect(cd).not.toBeNull();
    expect(cd!.until.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    const before = hits;
    await prisma.searchProfile.update({ where: { id: p.id }, data: { lastCheckedAt: new Date(Date.now() - 3600_000) } });
    expect(await scheduleDueProfiles()).toBe(0); // gepauzeerd
    await expect(runProfileCheck(p.id)).rejects.toThrow(/Gepauzeerd/);
    expect(hits).toBe(before); // tijdens de pauze geen enkel request naar de bron
    // tweede blokkade kort daarna: langere pauze
    const { setCooldown } = await import("@/lib/jobs/cooldown");
    const second = await setCooldown("marktplaats-search", "HTTP 429");
    expect(second.level).toBe(2);
    expect(second.until.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
  });
});

describe("snelle modus: voorlopige push direct, definitieve push na de detailpagina", () => {
  const okSender = (calls: Array<{ payload: string }>): PushSender => async (_s, payload) => { calls.push({ payload }); return { statusCode: 201 }; };

  async function setup(fastMode: boolean) {
    const { user } = await makeUser();
    await saveConfig({ scheduler: { fast: { enabled: true } }, notifications: { enabled: true } });
    await profile(user.id, fastMode);
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/a", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
    await comps();
    return user;
  }
  const analyze = () => processJobs(handlers, { maxJobs: 50, types: ["ANALYZE_AD"], concurrency: 2 });

  it("snel profiel: voorlopige push zonder te wachten op de detailpagina, daarna precies één definitieve die dezelfde melding vervangt (zelfde tag)", async () => {
    await setup(true);
    const a = await ingestAd(raw({ detailLoaded: false }), { origin: "SEARCH", partial: true });
    await analyze();
    const prov = await prisma.notification.findMany({ where: { adId: a.adId, channel: "WEBPUSH" } });
    expect(prov).toHaveLength(1);
    expect(prov[0].dedupeKey.endsWith(":p")).toBe(true);
    const calls: Array<{ payload: string }> = [];
    await deliverNotification(prov[0].id, undefined, { push: okSender(calls) });
    const p1 = JSON.parse(calls[0].payload);
    expect(p1).toMatchObject({ provisional: true, url: `/ads/${a.adId}`, tag: `ad-${a.adId}` });
    expect(p1.title).toMatch(/^Voorlopig/);

    vi.stubGlobal("fetch", async (u: string) => {
      if (new URL(u).pathname === "/robots.txt") return new Response("User-agent: *");
      return new Response(`<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "iPhone 15 Pro 256GB", description: "Volledig: batterij 91%, icloud vrij, simlockvrij, ophalen of verzenden. ".repeat(3), sku: "m3000001", image: ["https://img.example/1.jpg", "https://img.example/9.jpg"], offers: { price: "300", priceCurrency: "EUR" } })}</script></head></html>`, { headers: { "content-type": "text/html" } });
    });
    await runDetailFetch(a.adId);
    await analyze();
    await analyze(); // herhaalde analyse maakt niets dubbel
    const all = await prisma.notification.findMany({ where: { adId: a.adId, channel: "WEBPUSH" }, orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(2); // voorlopig + definitief
    const fin = all.find((n) => !n.dedupeKey.endsWith(":p"))!;
    await deliverNotification(fin.id, undefined, { push: okSender(calls) });
    const p2 = JSON.parse(calls[1].payload);
    expect(p2.tag).toBe(p1.tag); // zelfde tag: vervangt de voorlopige melding op het toestel
    // de definitieve melding wacht niet meer op de volledige advertentie (andere voorbehouden, zoals onzekere marktwaarde, kunnen blijven staan)
    expect(p2.body).not.toMatch(/volledige advertentie/);
    expect(p1.body).toMatch(/volledige advertentie nog niet beoordeeld/);
  });

  it("normaal profiel: geen voorlopige push (wacht op volledige beoordeling)", async () => {
    await setup(false);
    const a = await ingestAd(raw({ detailLoaded: false }), { origin: "SEARCH", partial: true });
    await analyze();
    expect(await prisma.notification.count({ where: { adId: a.adId } })).toBe(0);
  });
});

describe("snelle modus: hele keten na ophalen (nagebootste bron en pushdienst)", () => {
  it("nieuwe iPhone op de zoekpagina → voorlopige push verzonden binnen enkele seconden eigen verwerkingstijd", async () => {
    const { user } = await makeUser();
    await saveConfig({ scheduler: { fast: { enabled: true } }, notifications: { enabled: true } });
    const p = await profile(user.id, true, { queries: ["iphone 15 pro"], category: "telecommunicatie/mobiele-telefoons-apple-iphone" });
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/a", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
    await prisma.marketComparable.createMany({ data: [700, 690, 710, 705, 695, 715, 702, 698].map((x, i) => ({ modelKey: "iphone-15-pro", storageGb: 128, priceCents: x * 100 - 20000, kind: i < 2 ? ("REALIZED" as const) : ("ASKING_CURRENT" as const), observedAt: new Date(Date.now() - i * 86400000) })) });
    const html = readFileSync("tests/fixtures/mp-search.html", "utf8");
    vi.stubGlobal("fetch", async (u: string) => {
      const url = new URL(u);
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /lrp/api/search*");
      return new Response(html, { headers: { "content-type": "text/html" } });
    });
    const sent: number[] = [];
    const t0 = Date.now();
    await runProfileCheck(p.id); // detectie: zoekpagina → ingest
    const calls: Array<{ payload: string }> = [];
    const sender: PushSender = async (_s, payload) => { calls.push({ payload }); sent.push(Date.now() - t0); return { statusCode: 201 }; };
    const benchHandlers = { ...handlers, NOTIFY: async (job: { payload: unknown }) => deliverNotification((job.payload as { notificationId: string }).notificationId, undefined, { push: sender }) };
    await processJobs(benchHandlers as never, { maxJobs: 50, types: ["ANALYZE_AD", "NOTIFY"], concurrency: 3 });
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.parse(calls[0].payload).provisional).toBe(true);
    expect(sent[0]).toBeLessThan(3000); // detectie → eerste push (ons deel van de keten)
    // detailpagina's staan klaar maar blokkeren de detectie niet
    expect(await prisma.backgroundJob.count({ where: { type: "FETCH_DETAIL" } })).toBeGreaterThan(0);
  });
});

describe("alleen echt nieuwe advertenties worden gemeld", () => {
  async function prep(baselineOffsetMs: number | null) {
    const { user } = await makeUser();
    await saveConfig({ scheduler: { fast: { enabled: true } }, notifications: { enabled: true } });
    await profile(user.id, true, baselineOffsetMs == null ? { baselineAt: undefined } : { baselineAt: new Date(Date.now() + baselineOffsetMs).toISOString() });
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/a", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
    await comps();
  }
  const analyze = () => processJobs(handlers, { maxJobs: 50, types: ["ANALYZE_AD"], concurrency: 2 });

  it("nulmeting: advertenties die bij de eerste controle al bestonden geven nooit een melding", async () => {
    await prep(+60_000); // baseline ligt ná de eerste zichtbaarheid van de advertentie
    const a = await ingestAd(raw(), { origin: "SEARCH", partial: true });
    await analyze();
    expect(await prisma.notification.count({ where: { adId: a.adId } })).toBe(0);
  });

  it("eerste controle loopt nog (nog geen nulmeting): geen meldingen", async () => {
    await prep(null);
    const a = await ingestAd(raw(), { origin: "SEARCH", partial: true });
    await analyze();
    expect(await prisma.notification.count({ where: { adId: a.adId } })).toBe(0);
  });

  it("oude advertentie die we pas nu tegenkomen (geplaatst >30 uur geleden) geeft geen melding; een verse wel", async () => {
    await prep(-3600_000);
    const old = await ingestAd(raw({ externalId: "m3000010", url: "https://www.marktplaats.nl/v/x/m3000010-a", title: "iPhone 15 Pro 256GB oud", location: "Zwolle", imageUrls: ["https://img.example/o1.jpg", "https://img.example/o2.jpg", "https://img.example/o3.jpg"], publishedAt: new Date(Date.now() - 72 * 3600_000) }), { origin: "SEARCH", partial: true });
    const fresh = await ingestAd(raw({ externalId: "m3000011", url: "https://www.marktplaats.nl/v/x/m3000011-a", title: "iPhone 15 Pro 256GB vers", location: "Breda", imageUrls: ["https://img.example/v1.jpg", "https://img.example/v2.jpg", "https://img.example/v3.jpg"], publishedAt: new Date() }), { origin: "SEARCH", partial: true });
    await analyze();
    expect(await prisma.notification.count({ where: { adId: old.adId } })).toBe(0);
    expect(await prisma.notification.count({ where: { adId: fresh.adId, channel: "WEBPUSH" } })).toBe(1);
  });
});
