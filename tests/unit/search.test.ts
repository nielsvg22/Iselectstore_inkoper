import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSearchUrl, mapSearchListing, mergeDetail, parseListingDate, parseSearchPage, searchConfigSchema } from "@/lib/sources/marktplaats-search";
import { buildPrefilter, isNoise } from "@/lib/sources/prefilter";
import { extractHtmlDescription, parseListingHtml } from "@/lib/sources/listing-parser";
import { parseRobots, robotsAllows } from "@/lib/sources/safe-fetch";
import { recognizeByRules } from "@/lib/engines/recognition";
import type { RawAd } from "@/lib/sources/types";

const fixture = readFileSync("tests/fixtures/mp-search.html", "utf8");
const NOW = new Date("2026-10-10T10:00:00Z");

// Disallow-regels zoals gepubliceerd in Marktplaats' robots.txt (gecontroleerd op 2026-10-10)
const ROBOTS = `User-agent: *
Disallow: /search?q=*
Disallow: /lrp/api/search*
Disallow: /lp/api/listings*
Disallow: /lrp/api/complementary-listings*
Disallow: */n/*
Disallow: /v/*/*/m*?c=*
Disallow: /u/*/*/q/*
Disallow: /bid/`;

describe("Marktplaats-zoekpagina (structuur van de echte pagina)", () => {
  it("leest alle advertenties uit de ingebedde data", () => {
    const p = parseSearchPage(fixture, NOW);
    expect(p.ads).toHaveLength(3);
    expect(p.total).toBeGreaterThan(1000);
    expect(p.maxPage).toBe(75);
    const a = p.ads[1];
    expect(a).toMatchObject({ externalId: "m2451691443", title: "iPhone 15 Pro 128GB Zwart" });
    expect(a.url).toBe("https://www.marktplaats.nl/v/telecommunicatie/mobiele-telefoons-apple-iphone/m2451691443-iphone-15-pro-128gb-zwart");
    expect(a.askingCents).toBeGreaterThan(0);
    expect(a.imageUrls[0]).toMatch(/^https:\/\/images\.marktplaats\.com/);
    expect(a.publishedAt).toBeInstanceOf(Date);
  });

  it("neemt door de verkoper ingevulde kenmerken (batterij, kleur) mee als 'volgens verkoper'", () => {
    const a = parseSearchPage(fixture, NOW).ads[0];
    expect(Object.keys(a.attributes ?? {})).toEqual(expect.arrayContaining(["battery health", "color"]));
    const r = recognizeByRules({ title: a.title, description: a.description, structured: a.attributes });
    expect(r.facts.batteryHealth).toMatchObject({ value: 83, source: "SELLER_CLAIM" });
    expect(r.modelKey).toBe("iphone-15-pro-max");
  });

  it("zet prijstypes om en slaat gereserveerde advertenties over", () => {
    const base = { itemId: "m1", title: "t", vipUrl: "/v/x/m1-t", priceInfo: { priceCents: 5000, priceType: "FIXED" }, location: { cityName: "Utrecht", distanceMeters: -1000 }, imageUrls: ["//img/x.jpg"], date: "Gisteren" };
    expect(mapSearchListing(base, NOW)).toMatchObject({ askingCents: 5000, location: "Utrecht", distanceKm: null });
    expect(mapSearchListing({ ...base, priceInfo: { priceCents: 0, priceType: "SEE_DESCRIPTION" } }, NOW)?.askingCents).toBeNull();
    expect(mapSearchListing({ ...base, priceInfo: { priceCents: 5000, priceType: "MIN_BID" } }, NOW)?.askingCents).toBe(5000);
    expect(mapSearchListing({ ...base, reserved: true }, NOW)).toBeNull();
    expect(mapSearchListing({ ...base, location: { cityName: "X", distanceMeters: 34500 } }, NOW)?.distanceKm).toBe(34.5);
    expect(mapSearchListing({ ...base, attributes: [{ key: "delivery", value: "Ophalen of Verzenden" }] }, NOW)?.shipping).toEqual(["pickup", "shipping"]);
    expect(mapSearchListing({ title: "zonder id" }, NOW)).toBeNull();
  });

  it("faalt duidelijk bij een onleesbare of gewijzigde pagina", () => {
    expect(() => parseSearchPage("<html>botcontrole</html>")).toThrow(/geen leesbare resultaten/);
    expect(() => parseSearchPage('<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>')).toThrow(/Onverwachte structuur/);
    expect(() => parseSearchPage('<script id="__NEXT_DATA__" type="application/json">{kapot</script>')).toThrow(/gelezen/);
  });

  it("parseert Nederlandse relatieve datums", () => {
    expect(parseListingDate("Vandaag", NOW)?.toISOString()).toBe(NOW.toISOString());
    expect(parseListingDate("Gisteren", NOW)!.getTime()).toBe(NOW.getTime() - 86400000);
    expect(parseListingDate("Eergisteren", NOW)!.getTime()).toBe(NOW.getTime() - 2 * 86400000);
    expect(parseListingDate("5 okt.", NOW)?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(parseListingDate("12 dec.", NOW)?.toISOString().slice(0, 10)).toBe("2025-12-12");
    expect(parseListingDate("3 mrt. '24", NOW)?.toISOString().slice(0, 10)).toBe("2024-03-03");
    expect(parseListingDate("onzin", NOW)).toBeNull();
  });

  it("vult afgekapte zoekresultaten aan met de volledige detailtekst", () => {
    const list = { externalId: "m1", url: "u", title: "t", description: "kort", askingCents: null, location: "Breda", imageUrls: ["a"] } as RawAd;
    const detail = { externalId: "m1", url: "u", title: "t", description: "veel langere volledige tekst met icloud vergrendeld", askingCents: 9900, imageUrls: ["a", "b"] } as RawAd;
    const m = mergeDetail(list, detail);
    expect(m).toMatchObject({ description: detail.description, askingCents: 9900, location: "Breda" });
    expect(m.imageUrls).toEqual(["a", "b"]);
  });
});

describe("zoek-URL's: veilig en toegestaan volgens robots.txt", () => {
  const dis = parseRobots(ROBOTS);
  it("bouwt de URL's die we daadwerkelijk gebruiken en robots.txt staat ze toe", () => {
    const urls = [
      buildSearchUrl("iPhone 15 Pro", undefined, 1),
      buildSearchUrl("iphone 15 pro", "telecommunicatie/mobiele-telefoons-apple-iphone", 1),
      buildSearchUrl("iphone 15 pro", "telecommunicatie/mobiele-telefoons-apple-iphone", 3),
    ];
    expect(urls).toEqual([
      "https://www.marktplaats.nl/q/iphone+15+pro/",
      "https://www.marktplaats.nl/l/telecommunicatie/mobiele-telefoons-apple-iphone/q/iphone+15+pro/",
      "https://www.marktplaats.nl/l/telecommunicatie/mobiele-telefoons-apple-iphone/q/iphone+15+pro/p/3/",
    ]);
    for (const u of urls) expect(robotsAllows(dis, new URL(u).pathname + new URL(u).search)).toBe(true);
  });
  it("de door robots.txt verboden zoek-API wordt geweigerd", () => {
    for (const p of ["/lrp/api/search?query=iphone", "/search?q=iphone", "/lp/api/listings?x=1", "/l/telecommunicatie/n/foo"]) expect(robotsAllows(dis, p)).toBe(false);
  });
  it("codeert zoektermen veilig (geen padmanipulatie of hostwissel)", () => {
    const u = buildSearchUrl("a/b?c=d#e & ../../x", undefined, 1);
    expect(new URL(u).host).toBe("www.marktplaats.nl");
    expect(new URL(u).pathname.startsWith("/q/")).toBe(true);
    expect(new URL(u).search).toBe("");
    expect(u).not.toContain("..");
  });
  it("valideert de zoekconfiguratie (categoriepad, aantallen)", () => {
    expect(searchConfigSchema.safeParse({ queries: ["iphone 15 pro"], category: "telecommunicatie/mobiele-telefoons-apple-iphone" }).success).toBe(true);
    expect(searchConfigSchema.safeParse({ queries: ["iphone"], category: "../../etc" }).success).toBe(false);
    expect(searchConfigSchema.safeParse({ queries: ["iphone"], category: "https://evil.example" }).success).toBe(false);
    expect(searchConfigSchema.safeParse({ queries: [] }).success).toBe(false);
    expect(searchConfigSchema.safeParse({ queries: ["iphone"], maxPages: 99 }).success).toBe(false);
  });
});

describe("voorselectie op basis van het zoekprofiel", () => {
  const ad = (title: string, cents: number | null): RawAd => ({ externalId: "x", url: "u", title, description: "", askingCents: cents, imageUrls: [] });
  const tree = { op: "AND" as const, children: [{ field: "askingEuro", operator: "lte" as const, value: 400 }, { field: "modelKey", operator: "in" as const, value: ["iphone-15-pro"] }] };
  it("sluit te dure en andere modellen uit, laat onzekere gevallen door", () => {
    const f = buildPrefilter(tree)!;
    expect(f(ad("iPhone 15 Pro 256GB", 35000))).toBe(true);
    expect(f(ad("iPhone 15 Pro 256GB", 45000))).toBe(false);
    expect(f(ad("iPhone 13 128GB", 20000))).toBe(false);
    expect(f(ad("iPhone 15 Pro 256GB", null))).toBe(true);
    expect(f(ad("Mooie telefoon", 20000))).toBe(true);
  });
  it("filtert altijd ruis: koopadvertenties en losse accessoires", () => {
    const f = buildPrefilter({ op: "AND", children: [] })!;
    expect(f(ad("GEZOCHT EN GEKOCHT – DIRECT CASH VOOR JOUW IPHONE!", 0))).toBe(false);
    expect(f(ad("Iphone lens beschermers", 500))).toBe(false);
    expect(f(ad("iPhone 15 Pro hoesje", 1500))).toBe(false);
    expect(f(ad("iPhone 15 Pro 256GB met hoesje en oplader", 60000))).toBe(true);
    expect(f(ad("iPhone 15 Pro 128GB", 40000))).toBe(true);
    expect(isNoise(ad("Ik koop jouw iPhone", null))).toBe(true);
  });
  it("zonder zekere regels blijft alleen de ruisfilter over; OR-logica filtert niet op prijs of model", () => {
    const f = buildPrefilter({ op: "AND", children: [{ field: "score", operator: "gte", value: 50 }] })!;
    expect(f(ad("iPhone 13 128GB", 99999900))).toBe(true);
    expect(buildPrefilter({ op: "OR", children: tree.children })).toBeUndefined();
  });
});

describe("volledige advertentietekst uit de pagina-HTML", () => {
  const frag = '<div class="Description-module-description"><div data-collapsable="description">Te koop: iPhone 15 Pro.<br>Batterij 88%. Let op: &amp; icloud <b>vergrendeld</b>, wachtwoord kwijt.<br /><br /><br />Ophalen in Wierden.</div></div>';
  it("haalt tekst op met regeleinden, zonder tags en met gedecodeerde entiteiten", () => {
    const t = extractHtmlDescription(frag)!;
    expect(t).toBe("Te koop: iPhone 15 Pro.\nBatterij 88%. Let op: & icloud vergrendeld, wachtwoord kwijt.\n\nOphalen in Wierden.");
    expect(extractHtmlDescription("<html></html>")).toBeNull();
  });
  it("de volledige tekst wint van de afgekapte JSON-LD-beschrijving, zodat risico's uit de staart worden gezien", () => {
    const ld = JSON.stringify({ "@type": "Product", name: "iPhone 15 Pro", description: "Te koop: iPhone 15 Pro.", sku: "m1234567", offers: { price: "300" } });
    const html = `<html><script type="application/ld+json">${ld}</script>${frag}</html>`;
    const ad = parseListingHtml(html, "https://www.marktplaats.nl/v/x/m1234567-iphone");
    expect(ad.description).toContain("icloud vergrendeld");
    const r = recognizeByRules({ title: ad.title, description: ad.description });
    expect(r.signals.map((s) => s.code)).toContain("ACTIVATION_LOCK");
  });
});

import { hiRes, imageKey, mergeImages } from "@/lib/images";
describe("scherpe foto's", () => {
  const thumb = "https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/c523?rule=ecg_mp_eps$_82.jpg";
  it("schaalt de miniatuur (82) op naar de gevraagde maat", () => {
    expect(hiRes(thumb, "full")).toBe("https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/c523?rule=ecg_mp_eps$_86.jpg");
    expect(hiRes(thumb, "card")).toMatch(/\$_85\.jpg$/);
    expect(hiRes(thumb, "thumb")).toMatch(/\$_83\.jpg$/);
    expect(hiRes("https://images.marktplaats.com/x?rule=ecg_mp_eps$_#.jpg", "full")).toMatch(/\$_86\.jpg$/);
  });
  it("laat andere hosts en lege waarden ongemoeid", () => {
    expect(hiRes("https://cdn.example/a_82.jpg")).toBe("https://cdn.example/a_82.jpg");
    expect(hiRes("/api/demo-image/iphone")).toBe("/api/demo-image/iphone");
    expect(hiRes(null)).toBe("");
  });
  it("herkent dezelfde foto in verschillende maten en voegt lijsten samen zonder dubbelen", () => {
    const a = "https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/abc?rule=ecg_mp_eps$_82.jpg";
    const b = "https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/abc?rule=ecg_mp_eps$_86";
    const c = "//images.marktplaats.com/api/v1/hz-mp-pro-listing/images/def?rule=ecg_mp_eps$_86";
    expect(imageKey(a)).toBe(imageKey(b));
    expect(mergeImages([b, c], [a])).toEqual([b, c]);
    expect(mergeImages([], [a, b, c])).toEqual([a, c]);
  });
  it("zoekresultaten worden meteen met hoge resolutie opgeslagen", () => {
    const a = parseSearchPage(fixture, NOW).ads[0];
    expect(a.imageUrls[0]).toMatch(/\$_86\.jpg$/);
  });
});
