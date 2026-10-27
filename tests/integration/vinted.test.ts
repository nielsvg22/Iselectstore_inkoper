import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { getCooldown } from "@/lib/jobs/cooldown";
import { handlers, runProfileCheck, scheduleDueProfiles } from "@/lib/jobs/handlers";
import { processJobs } from "@/lib/jobs/queue";
import { saveRules, defaultRules } from "@/lib/rules/config";
import { prefilterStats } from "@/lib/rules/prefilter-stats";
import { saveFilters } from "@/lib/rules/filters";
import { clearRulesCache } from "@/lib/rules/apply";
import { saveConfig } from "@/lib/settings/store";
import { saveTree } from "@/lib/pipeline/tree";
import { listDeals } from "@/lib/queries";
import { latestVintedAds } from "@/lib/vinted-feed";
import { provisionVintedRadar, vintedStatus } from "@/lib/vinted-radar";
import { makeUser, resetDb } from "../helpers";

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

const CATALOG = readFileSync("tests/fixtures/vinted/catalog.html", "utf8");
const ITEM = readFileSync("tests/fixtures/vinted/item.html", "utf8");
const MP = readFileSync("tests/fixtures/mp-search.html", "utf8");

function stubSites(o: { catalog?: string; vintedStatus?: number; mpStatus?: number } = {}) {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (u: string) => {
    const url = new URL(u);
    seen.push(`${url.host}${url.pathname}`);
    if (url.pathname === "/robots.txt") return new Response(url.host.includes("vinted") ? "User-agent: *\nDisallow: /member/\nDisallow: /inbox" : "User-agent: *\nDisallow: /lrp/api/search*");
    if (url.host.includes("vinted")) {
      if (o.vintedStatus && o.vintedStatus !== 200) return new Response("blocked", { status: o.vintedStatus });
      if (url.pathname === "/catalog") return new Response(o.catalog ?? CATALOG, { headers: { "content-type": "text/html" } });
      if (url.pathname.startsWith("/items/")) return new Response(ITEM, { headers: { "content-type": "text/html" } });
    }
    if (o.mpStatus && o.mpStatus !== 200) return new Response("blocked", { status: o.mpStatus });
    return new Response(MP, { headers: { "content-type": "text/html" } });
  });
  return seen;
}

async function setup() {
  const { user } = await makeUser();
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 }, notifications: { enabled: true, requireFullAnalysis: false }, sources: { allowed: ["SEARCH", "MANUAL_URL", "IMPORT", "FEED", "DEMO", "PARTNER_API"] } });
  await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/v", p256dh: "p".repeat(30), auth: "a".repeat(12), label: "t" } });
  const r = await provisionVintedRadar(user.id, { enabled: true, minGapSeconds: 3 });
  return { user, profileId: r.id };
}
const jobs = () => processJobs(handlers as never, { maxJobs: 80, types: ["FETCH_DETAIL", "ANALYZE_AD", "ROUTE_AD"], concurrency: 1 });

beforeEach(async () => {
  await resetDb();
  clearRulesCache();
  vi.unstubAllGlobals();
});

describe("Vinted-zoekprofiel", () => {
  it("wordt aangemaakt met zoektermen uit de modellenlijst en is standaard uitgeschakeld in de schaalinstellingen", async () => {
    const { user } = await makeUser();
    expect((await vintedStatus(user.id)).settings.enabled).toBe(false);
    await saveFilters([{ id: "a", modelKey: "ipad-mini-6", variant: "", storageGb: null, condition: "normal", minEuro: 50, maxEuro: 150, maxKm: 300, adType: "all", sellerType: "Alle", sellerMinMonths: 0, active: true, resaleEuro: null, minMarginEuro: null }]);
    const r = await provisionVintedRadar(user.id, { enabled: true });
    expect(r.created).toBe(true);
    expect(r.queries).toEqual(["ipad"]);
    expect((await provisionVintedRadar(user.id, {})).created).toBe(false); // idempotent
    expect(await prisma.searchProfile.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("Vinted ophalen en verwerken", () => {
  it("slaat advertenties platformspecifiek op, zonder dubbelen bij een tweede controle", async () => {
    const { profileId } = await setup();
    stubSites();
    const first = await runProfileCheck(profileId);
    // de pagina bevat 5 hoesjes en 1 telefoon: de hoesjes worden al bij het ophalen weggelaten en geteld
    expect(first.created).toBe(1);
    expect((await prefilterStats("vinted")).accessory).toBe(5);
    const second = await runProfileCheck(profileId);
    expect(second.created).toBe(0);
    const ads = await prisma.advertisement.findMany({ where: { source: "vinted" } });
    expect(ads).toHaveLength(1);
    expect(await prisma.advertisement.count({ where: { source: "marktplaats" } })).toBe(0);
    const a = ads.find((x) => x.externalId === "10554363104")!;
    expect(a.url).toBe("https://www.vinted.nl/items/10554363104-apple-iphone-14-256gb-violett-ladekabel");
    expect(a.askingPriceCents).toBe(29500);
    expect(a.location).toBeNull();
    expect(a.distanceKm).toBeNull();
  });

  it("vult na de zoekpagina de details aan (omschrijving, verkoper, bescherming)", async () => {
    const { profileId } = await setup();
    stubSites();
    await runProfileCheck(profileId);
    await jobs();
    const a = await prisma.advertisement.findFirst({ where: { source: "vinted", externalId: "10554363104" } });
    expect(a?.detailFetchedAt).not.toBeNull();
    expect(a?.description).toContain("Batterijconditie 81%");
    expect((a?.sellerSignals as { reviewCount?: number; rating?: number })).toMatchObject({ reviewCount: 368, rating: 4.9 });
    const attrs = (a?.rawPayload as { attributes?: Record<string, string> }).attributes;
    expect(attrs).toMatchObject({ platform: "vinted", buyerProtection: "yes", electronicsVerification: "no" });
  });

  it("een nieuwe advertentie na de nulmeting geeft precies één melding (en niet dubbel bij herhaald zoeken)", async () => {
    const { user, profileId } = await setup();
    stubSites();
    await runProfileCheck(profileId); // nulmeting
    await jobs();
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);
    const fresh = CATALOG.split("10554363104").join("10999999999").split("Apple IPhone 14 256GB violett + Ladekabel").join("iPhone 15 Pro 256GB titanium").split("02_01cfb_9Rin7DuQFHeAPAcUEwyu1jRa").join("02_99999_nieuwefoto");
    stubSites({ catalog: fresh });
    const r = await runProfileCheck(profileId);
    expect(r.created).toBe(1);
    await jobs();
    const ad = await prisma.advertisement.findFirstOrThrow({ where: { source: "vinted", externalId: "10999999999" } });
    const n1 = await prisma.notification.count({ where: { adId: ad.id } });
    expect(n1).toBeGreaterThan(0);
    await runProfileCheck(profileId);
    await jobs();
    expect(await prisma.notification.count({ where: { adId: ad.id } })).toBe(n1);
    expect(await prisma.notification.count({ where: { adId: ad.id, channel: "WEBPUSH", userId: user.id } })).toBe(1);
  });
});

describe("Vinted-tab", () => {
  it("toont de nieuwste Vinted-advertenties met oordeel en of er een melding is verstuurd", async () => {
    const { profileId } = await setup();
    stubSites();
    await runProfileCheck(profileId);
    await jobs();
    const rows = await latestVintedAds(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: expect.stringMatching(/iphone 14/i), priceEuro: 295, detailLoaded: true, notified: 0 });
    expect(rows[0].status).not.toBe("wacht op analyse");
    expect(await latestVintedAds(10)).toEqual(rows);
  });
});

describe("snelheid en heel Nederland", () => {
  const fresh = CATALOG.split("10554363104").join("10666666666").split("Apple IPhone 14 256GB violett + Ladekabel").join("iPhone 15 Pro 256GB titanium").split("02_01cfb_9Rin7DuQFHeAPAcUEwyu1jRa").join("02_77777_snel");

  it("een nieuwe advertentie krijgt direct een voorlopige push, nog vóór de detailpagina is opgehaald", async () => {
    const { user, profileId } = await setup();
    await saveConfig({ notifications: { requireFullAnalysis: true } });
    stubSites();
    await runProfileCheck(profileId); // nulmeting
    await processJobs(handlers as never, { maxJobs: 80, types: ["FETCH_DETAIL", "ANALYZE_AD"], concurrency: 1 });
    stubSites({ catalog: fresh });
    const t0 = Date.now();
    await runProfileCheck(profileId);
    // alleen de snelle analyse, géén detailpagina
    await processJobs(handlers as never, { maxJobs: 20, types: ["ANALYZE_AD"], concurrency: 1 });
    const ad = await prisma.advertisement.findFirstOrThrow({ where: { source: "vinted", externalId: "10666666666" } });
    expect(ad.detailFetchedAt).toBeNull();
    const n = await prisma.notification.findFirst({ where: { adId: ad.id, channel: "WEBPUSH", userId: user.id } });
    expect(n).not.toBeNull();
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("Vinted-advertenties zijn zichtbaar bij stads- en rijtijdbeleid (heel Nederland) en worden niet als 'afstand onbekend' gemarkeerd", async () => {
    const { profileId } = await setup();
    await saveConfig({ radar: { cityOnly: "Apeldoorn" }, policies: { distance: { mode: "driving" } } });
    await saveRules({ ...defaultRules(), distance: { ...defaultRules().distance, includeShipping: false } });
    clearRulesCache();
    stubSites();
    await runProfileCheck(profileId);
    await jobs();
    const { rows } = await listDeals({ limit: 50 });
    expect(rows.some((r) => r.ad.source === "vinted")).toBe(true);
    const an = await prisma.dealAnalysis.findFirstOrThrow({ where: { isCurrent: true, ad: { source: "vinted" } } });
    const rules = (an.costs as { rules?: { status?: string; flags?: string[]; notes?: string[] } }).rules;
    expect(rules?.flags ?? []).not.toContain("distanceUnknown");
  });
});

describe("filters in de keten (Vinted)", () => {
  async function withRules(patch: Record<string, unknown>, filters: Parameters<typeof saveFilters>[0]) {
    await saveRules({ ...defaultRules(), ...patch });
    await saveFilters(filters);
    clearRulesCache();
  }
  const row = (o: Record<string, unknown>) => ({ id: Math.random().toString(), modelKey: "iphone-14", variant: "", storageGb: null, condition: "normal", minEuro: 200, maxEuro: 400, maxKm: 300, adType: "all", sellerType: "Alle", sellerMinMonths: 0, active: true, resaleEuro: null, minMarginEuro: null, ...o });

  it("accessoire wordt al bij het ophalen weggelaten, geteld en veroorzaakt geen melding", async () => {
    const { user, profileId } = await setup();
    await withRules({ filters: { enabled: true, outsideList: "reject" }, priceBase: "buy85" }, [row({})]);
    const onlyCase = CATALOG.split("Apple IPhone 14 256GB violett + Ladekabel").join("iPhone 14 hoesje");
    stubSites({ catalog: onlyCase });
    const r = await runProfileCheck(profileId);
    expect(r.created).toBe(0);
    expect((await prefilterStats("vinted")).accessory).toBe(6);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);
  });

  it("onvoldoende marge → geen melding en de reden wordt bewaard in het oordeel", async () => {
    const { user, profileId } = await setup();
    await withRules({ filters: { enabled: true, outsideList: "reject" }, priceBase: "buy85", margin: { ...defaultRules().margin, enabled: true } }, [row({ minEuro: 200, maxEuro: 400, resaleEuro: 320, minMarginEuro: 100 })]);
    stubSites();
    await runProfileCheck(profileId); // nulmeting
    await jobs();
    const fresh = CATALOG.split("10554363104").join("10777777777").split("Apple IPhone 14 256GB violett + Ladekabel").join("iPhone 14 128GB zwart").split("02_01cfb_9Rin7DuQFHeAPAcUEwyu1jRa").join("02_88888_andere");
    stubSites({ catalog: fresh });
    await runProfileCheck(profileId);
    await jobs();
    const ad = await prisma.advertisement.findFirstOrThrow({ where: { source: "vinted", externalId: "10777777777" } });
    expect(await prisma.notification.count({ where: { adId: ad.id, userId: user.id } })).toBe(0);
    const an = await prisma.dealAnalysis.findFirst({ where: { adId: ad.id, isCurrent: true } });
    const rules = (an?.costs as { rules?: { status: string; decidedBy: string; reasons: string[] } }).rules;
    expect(rules).toMatchObject({ status: "reject", decidedBy: "margin" });
    expect(rules?.reasons[0]).toContain("winst");
  });

  it("buiten het prijsvenster van het model → geen melding", async () => {
    const { profileId } = await setup();
    await withRules({ filters: { enabled: true, outsideList: "reject" }, priceBase: "buy85" }, [row({ maxEuro: 250 })]);
    stubSites();
    await runProfileCheck(profileId);
    await jobs();
    const rejected = await prisma.dealAnalysis.findMany({ where: { isCurrent: true, ad: { source: "vinted" } }, select: { costs: true } });
    const decided = rejected.map((r) => (r.costs as { rules?: { decidedBy?: string } }).rules?.decidedBy);
    expect(decided).toContain("price-window");
  });
});

describe("storingen en isolatie", () => {
  it("Vinted 403: bron gepauzeerd, geen omzeiling, Marktplaats blijft ongemoeid", async () => {
    const { user, profileId } = await setup();
    stubSites({ vintedStatus: 403 });
    await expect(runProfileCheck(profileId)).rejects.toThrow(/403/);
    expect(await getCooldown("vinted-search")).not.toBeNull();
    expect(await getCooldown("marktplaats-search")).toBeNull();
    // geen verdere requests tijdens de pauze
    const seen = stubSites({ vintedStatus: 403 });
    await expect(runProfileCheck(profileId)).rejects.toThrow(/Gepauzeerd/);
    expect(seen.filter((s) => s.includes("vinted")).length).toBe(0);
    // een Marktplaats-profiel draait gewoon door
    const mp = await prisma.searchProfile.create({ data: { userId: user.id, name: "MP", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: [], intervalMinutes: 10, sourceConfig: { queries: ["iphone 15 pro"], fastMode: false } } });
    await saveTree(mp.id, { op: "AND", children: [] });
    stubSites();
    const r = await runProfileCheck(mp.id);
    expect(r.fetched).toBeGreaterThan(0);
    expect(await prisma.advertisement.count({ where: { source: "marktplaats" } })).toBeGreaterThan(0);
  });

  it("onverwacht paginaformaat of botcontrole geeft een duidelijke fout en wordt niet omzeild", async () => {
    const { profileId } = await setup();
    stubSites({ catalog: "<html>geen resultaten</html>" });
    await expect(runProfileCheck(profileId)).rejects.toThrow(/onverwacht formaat/);
    expect(await prisma.advertisement.count({ where: { source: "vinted" } })).toBe(0);
    stubSites({ catalog: '<html><script src="https://geo.captcha-delivery.com/x"></script></html>' });
    await expect(runProfileCheck(profileId)).rejects.toThrow(/CAPTCHA/);
  });

  it("de scheduler plant Vinted alleen als het aan staat en niet tijdens een pauze; Marktplaats blijft los", async () => {
    const { user, profileId } = await setup();
    await saveConfig({ scheduler: { vinted: { enabled: false } } });
    expect(await scheduleDueProfiles()).toBe(0);
    await saveConfig({ scheduler: { vinted: { enabled: true, intervalSeconds: 30 } } });
    expect(await scheduleDueProfiles()).toBe(1);
    expect(await prisma.backgroundJob.count({ where: { type: "CHECK_PROFILE", payload: { path: ["profileId"], equals: profileId } } })).toBe(1);
    const { setCooldown } = await import("@/lib/jobs/cooldown");
    await prisma.backgroundJob.deleteMany({});
    await setCooldown("vinted-search", "HTTP 429");
    expect(await scheduleDueProfiles()).toBe(0);
    expect(await getCooldown("marktplaats-search")).toBeNull();
    expect(user.id).toBeTruthy();
  });

  it("zonder ingeschakelde Vinted wordt er niets opgehaald", async () => {
    const { profileId } = await setup();
    await saveConfig({ scheduler: { vinted: { enabled: false } } });
    const seen = stubSites();
    await expect(runProfileCheck(profileId)).rejects.toThrow(/staat uit/);
    expect(seen.length).toBe(0);
  });
});
