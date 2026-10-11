import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }, lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { prisma } from "@/lib/db/client";
import { runProfileCheck, scheduleDueProfiles } from "@/lib/jobs/handlers";
import { saveTree } from "@/lib/pipeline/tree";
import { processJobs } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { saveConfig } from "@/lib/settings/store";
import { clearPageCache } from "@/lib/sources/marktplaats-search";
import { ctx, makeUser, req, resetDb } from "../helpers";
import { POST as refreshAd } from "@/app/api/ads/[id]/refresh/route";

const SEARCH_HTML = readFileSync("tests/fixtures/mp-search.html", "utf8");
const ROBOTS = "User-agent: *\nDisallow: /lrp/api/search*\nDisallow: /search?q=*\nDisallow: /lp/api/listings*\nDisallow: */n/*";
const detailHtml = (id: string, title: string, price: number) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: title, description: "Volledige tekst: batterij 90%. icloud vrij, simlockvrij. Prima staat, ophalen in Utrecht. ".repeat(3), sku: id, image: [1, 2, 3, 4].map((n) => `https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/${id}-${n}?rule=ecg_mp_eps$_86`), offers: { "@type": "Offer", price: String(price), priceCurrency: "EUR" } })}</script></head></html>`;

let requested: string[] = [];
function stubFetch(over: { searchStatus?: number; page2?: string } = {}) {
  requested = [];
  vi.stubGlobal("fetch", async (u: string) => {
    const url = new URL(u);
    requested.push(url.pathname);
    if (url.pathname === "/robots.txt") return new Response(ROBOTS);
    if (url.pathname.includes("/q/iphone")) {
      if (over.searchStatus) return new Response("geweigerd", { status: over.searchStatus });
      return new Response(url.pathname.includes("/p/2/") ? (over.page2 ?? "<html></html>") : SEARCH_HTML, { headers: { "content-type": "text/html" } });
    }
    const m = /\/(m\d+|a\d+)-/.exec(url.pathname);
    if (m) return new Response(detailHtml(m[1], "iPhone 15 Pro 128GB Zwart", 420), { headers: { "content-type": "text/html" } });
    return new Response("niet gevonden", { status: 404 });
  });
}

/** Verwerkt de asynchrone detail-jobs (nieuwe advertenties worden eerst opgenomen, details volgen). */
async function drainDetails() {
  await processJobs(handlers, { maxJobs: 100, types: ["FETCH_DETAIL"], concurrency: 1 });
}

async function searchProfile(tree: unknown, config: Record<string, unknown> = {}) {
  const { user } = await makeUser();
  const p = await prisma.searchProfile.create({
    data: { userId: user.id, name: "iPhone 15 Pro inkoop", sourceKind: "SEARCH", intervalMinutes: 30, sourceConfig: { queries: ["iphone 15 pro"], category: "telecommunicatie/mobiele-telefoons-apple-iphone", maxPages: 3, fetchDetails: true, ...config } },
  });
  await saveTree(p.id, tree);
  return p;
}

beforeEach(async () => {
  await resetDb();
  vi.unstubAllGlobals();
  clearPageCache();
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 } });
});

describe("automatisch zoeken op Marktplaats", () => {
  it("haalt resultaten op, past de voorselectie van het profiel toe en slaat advertenties op", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [{ field: "askingEuro", operator: "lte", value: 450 }, { field: "modelKey", operator: "in", value: ["iphone-15-pro"] }] });
    const r = await runProfileCheck(p.id);
    expect(r.fetched).toBeGreaterThan(0);
    const ads = await prisma.advertisement.findMany();
    expect(ads.length).toBe(r.fetched);
    for (const a of ads) {
      expect(a.origin).toBe("SEARCH");
      expect(a.isDemo).toBe(false);
      expect(a.title.toLowerCase()).toContain("iphone 15 pro");
      expect(a.title.toLowerCase()).not.toContain("max"); // ander model: uitgefilterd door voorselectie
      expect(a.askingPriceCents!).toBeLessThanOrEqual(45000);
      expect(a.url).toMatch(/^https:\/\/www\.marktplaats\.nl\/v\//);
    }
    const prof = await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } });
    expect(prof.lastSuccessAt).toBeTruthy();
    expect(prof.lastError).toBeNull();
    const health = await prisma.sourceHealth.findUniqueOrThrow({ where: { id: "marktplaats-search" } });
    expect(health.ok).toBe(true);
  });

  it("gebruikt uitsluitend toegestane paden — nooit de door robots.txt verboden zoek-API", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] });
    await runProfileCheck(p.id);
    await drainDetails();
    expect(requested.length).toBeGreaterThan(1);
    for (const path of requested) {
      expect(path).not.toMatch(/\/lrp\/api\/|\/lp\/api\/|^\/search/);
      expect(path).toMatch(/^\/(robots\.txt|l\/telecommunicatie\/mobiele-telefoons-apple-iphone\/q\/iphone\+15\+pro\/|v\/)/);
    }
  });

  it("pagineert tot maxPages, stopt bij een lege volgende pagina en dedupliceert tussen zoektermen", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { queries: ["iphone 15 pro", "iphone 15 pro"], maxPages: 3, fetchDetails: false });
    // pagina 1 heeft maar 3 resultaten (<30) => stopt; tweede identieke zoekterm voegt niets toe
    const r = await runProfileCheck(p.id);
    expect(r.fetched).toBe(3);
    expect(await prisma.advertisement.count()).toBe(3);
    // identieke zoekterm: de tweede keer komt uit de gedeelde paginacache (niet nogmaals bij de bron opgehaald)
    expect(requested.filter((x) => x.includes("/q/iphone")).length).toBe(1);
    const run = await prisma.checkRun.findFirstOrThrow({ where: { profileId: p.id } });
    expect(run).toMatchObject({ ok: true, pages: 1, cacheHits: 1, fetched: 3, created: 3 });
  });

  it("eerste geslaagde controle legt de nulmeting vast; die blijft daarna ongewijzigd", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: false });
    await runProfileCheck(p.id);
    const first = ((await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } })).sourceConfig as { baselineAt?: string }).baselineAt;
    expect(first).toBeTruthy();
    await runProfileCheck(p.id);
    expect(((await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } })).sourceConfig as { baselineAt?: string }).baselineAt).toBe(first);
  });

  it("tweede run vindt dezelfde advertenties terug zonder dubbelen of nieuwe analyse", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: false });
    await runProfileCheck(p.id);
    const second = await runProfileCheck(p.id);
    expect(second.created).toBe(0);
    expect(second.changed).toBe(0);
    expect(await prisma.advertisement.count()).toBe(3);
    expect(await prisma.backgroundJob.count({ where: { type: "ANALYZE_AD" } })).toBe(3);
  });

  it("haalt volledige detailtekst alleen op voor nieuwe advertenties", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: true });
    await runProfileCheck(p.id);
    // de zoekronde zelf haalt géén detailpagina's op: nieuwe advertenties zijn direct opgenomen
    expect(requested.filter((x) => x.startsWith("/v/")).length).toBe(0);
    expect(await prisma.backgroundJob.count({ where: { type: "FETCH_DETAIL" } })).toBe(3);
    await drainDetails();
    expect(requested.filter((x) => x.startsWith("/v/")).length).toBe(3);
    const ad = await prisma.advertisement.findFirstOrThrow();
    expect(ad.description).toContain("Volledige tekst");
    stubFetch();
    await runProfileCheck(p.id);
    expect(requested.filter((x) => x.startsWith("/v/")).length).toBe(0);
  });

  it("respecteert maxAdsPerRun", async () => {
    stubFetch();
    await saveConfig({ limits: { maxAdsPerRun: 2 } });
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: false });
    const r = await runProfileCheck(p.id);
    expect(r.fetched).toBe(2);
  });

  it("toegang geweigerd (403/429) wordt netjes gemeld en niet omzeild", async () => {
    stubFetch({ searchStatus: 403 });
    const p = await searchProfile({ op: "AND", children: [] });
    await expect(runProfileCheck(p.id)).rejects.toThrow(/weigert toegang/);
    const prof = await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } });
    expect(prof.lastError).toMatch(/weigert toegang/);
    expect((await prisma.sourceHealth.findUniqueOrThrow({ where: { id: "marktplaats-search" } })).ok).toBe(false);
    expect(requested.filter((x) => x.includes("/q/iphone")).length).toBe(1); // geen herhaalpogingen/omwegen
    expect(await prisma.advertisement.count()).toBe(0);
  });

  it("is uit te schakelen via de toegestane bronnen", async () => {
    stubFetch();
    await saveConfig({ sources: { allowed: ["MANUAL_URL"] } });
    const p = await searchProfile({ op: "AND", children: [] });
    await expect(runProfileCheck(p.id)).rejects.toThrow(/uitgeschakeld/);
    expect(requested).toHaveLength(0);
  });

  it("wordt automatisch ingepland en volledig doorlopen: zoeken → analyseren → beoordelen", async () => {
    stubFetch();
    await searchProfile({ op: "AND", children: [{ field: "askingEuro", operator: "lte", value: 450 }] });
    expect(await scheduleDueProfiles()).toBe(1);
    const r = await processJobs(handlers, { maxJobs: 20, deadlineMs: 20000 });
    expect(r.failed).toBe(0);
    expect(await prisma.advertisement.count()).toBeGreaterThan(0);
    expect(await prisma.dealAnalysis.count({ where: { isCurrent: true } })).toBeGreaterThan(0);
    expect(await prisma.appleProduct.count()).toBeGreaterThan(0);
  });

  it("zoekprofiel zonder zoekterm wordt geweigerd bij opslaan", async () => {
    const { profileInput } = await import("@/lib/profile-schema");
    expect(profileInput.safeParse({ name: "x", sourceKind: "SEARCH", sourceConfig: {} }).success).toBe(false);
    expect(profileInput.safeParse({ name: "x", sourceKind: "SEARCH", sourceConfig: { queries: ["iphone 15"] } }).success).toBe(true);
    expect(profileInput.safeParse({ name: "x", sourceKind: "SEARCH", sourceConfig: { queries: ["iphone"], category: "../../x" } }).success).toBe(false);
  });

  it("alle foto's: zoekresultaat heeft 1 foto, de detailpagina levert de volledige set", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: true });
    await runProfileCheck(p.id);
    await drainDetails();
    const ad = await prisma.advertisement.findFirstOrThrow({ include: { images: { orderBy: { position: "asc" } } } });
    expect(ad.images.length).toBeGreaterThanOrEqual(4);
    expect(ad.detailFetchedAt).toBeTruthy();
    expect(ad.images.every((i) => /\$_86/.test(i.url))).toBe(true);
    // geen dubbele foto's van dezelfde afbeelding in verschillende maten
    const keys = ad.images.map((i) => i.url.replace(/\$_\d+.*$/, ""));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("een volgende zoekronde overschrijft de volledige tekst en fotoset niet met de afgekapte samenvatting", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: true });
    await runProfileCheck(p.id);
    const before = await prisma.advertisement.findFirstOrThrow({ include: { images: true } });
    const jobsBefore = await prisma.backgroundJob.count({ where: { type: "ANALYZE_AD" } });
    stubFetch();
    const second = await runProfileCheck(p.id);
    const after = await prisma.advertisement.findUniqueOrThrow({ where: { id: before.id }, include: { images: true } });
    expect(after.description).toBe(before.description);
    expect(after.images.length).toBe(before.images.length);
    expect(second.changed).toBe(0);
    expect(await prisma.backgroundJob.count({ where: { type: "ANALYZE_AD" } })).toBe(jobsBefore);
  });

  it("detail-jobs zijn idempotent en een tweede zoekronde zet er geen nieuwe klaar", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: true });
    await runProfileCheck(p.id);
    await runProfileCheck(p.id); // nog geen details opgehaald: zelfde uniqueKey => geen dubbele jobs
    expect(await prisma.backgroundJob.count({ where: { type: "FETCH_DETAIL" } })).toBe(3);
    await drainDetails();
    expect(await prisma.advertisement.count({ where: { detailFetchedAt: { not: null } } })).toBe(3);
    stubFetch();
    await runProfileCheck(p.id);
    await drainDetails();
    expect(requested.filter((x) => x.startsWith("/v/")).length).toBe(0);
  });

  it("op aanvraag verversen: foto's en tekst van één advertentie worden direct opgehaald", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: false });
    await runProfileCheck(p.id);
    const ad = await prisma.advertisement.findFirstOrThrow({ include: { images: true } });
    expect(ad.detailFetchedAt).toBeNull();
    const imagesBefore = ad.images.length;
    const { cookie } = await makeUser("ADMIN", "refresh@example.com");
    const res = await refreshAd(req(`/api/ads/${ad.id}/refresh`, { method: "POST", cookie, body: {} }), ctx({ id: ad.id }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; images: number };
    expect(body.ok).toBe(true);
    expect(body.images).toBeGreaterThan(imagesBefore);
    const after = await prisma.advertisement.findUniqueOrThrow({ where: { id: ad.id } });
    expect(after.detailFetchedAt).toBeTruthy();
    expect(after.description).toContain("Volledige tekst");
    expect(await prisma.dealAnalysis.count({ where: { adId: ad.id, isCurrent: true } })).toBe(1);
  });

  it("verversen van een verwijderde advertentie geeft een nette melding", async () => {
    stubFetch();
    const p = await searchProfile({ op: "AND", children: [] }, { fetchDetails: false });
    await runProfileCheck(p.id);
    const ad = await prisma.advertisement.findFirstOrThrow();
    vi.stubGlobal("fetch", async (u: string) => (new URL(u).pathname === "/robots.txt" ? new Response(ROBOTS) : new Response("weg", { status: 410 })));
    const { cookie } = await makeUser("ADMIN", "gone@example.com");
    const res = await refreshAd(req(`/api/ads/${ad.id}/refresh`, { method: "POST", cookie, body: {} }), ctx({ id: ad.id }));
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/niet meer beschikbaar/);
  });
});
