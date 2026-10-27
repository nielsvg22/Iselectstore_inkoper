import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SourceError } from "@/lib/sources/types";
import { catalogUrl, parseCatalogPage, parseItemPage, parseUploaded } from "@/lib/sources/vinted-parse";

const catalog = readFileSync("tests/fixtures/vinted/catalog.html", "utf8");
const item = readFileSync("tests/fixtures/vinted/item.html", "utf8");

describe("Vinted zoekpagina", () => {
  it("leest advertenties met prijs, foto's, conditie en verkoper-ID", () => {
    const page = parseCatalogPage(catalog);
    expect(page.ads).toHaveLength(6);
    expect(page.page).toBe(1);
    expect(page.totalPages).toBe(10);
    const a = page.ads[0];
    expect(a.externalId).toBe("10554363104");
    expect(a.url).toBe("https://www.vinted.nl/items/10554363104-apple-iphone-14-256gb-violett-ladekabel");
    expect(a.title).toMatch(/iphone 14/i);
    expect(a.askingCents).toBe(29500);
    expect(a.conditionText).toBe("Heel goed");
    expect(a.imageUrls.length).toBeGreaterThan(0);
    expect(a.seller?.id).toBe("1001");
    expect(a.attributes).toMatchObject({ platform: "vinted", priceType: "FIXED", buyerTotalCents: 31045 });
  });
  it("vult niet in wat de pagina niet levert", () => {
    const a = parseCatalogPage(catalog).ads[0];
    expect(a.location).toBeNull();
    expect(a.distanceKm).toBeNull();
    expect(a.publishedAt).toBeNull();
    expect(a.seller?.accountAgeMonths).toBeNull();
    expect(a.seller?.rating).toBeNull();
    expect(a.shipping).toEqual(["shipping"]);
  });
  it("geeft een duidelijke fout bij een onbekend paginaformaat of een botcontrole", () => {
    expect(() => parseCatalogPage("<html>niets</html>")).toThrow(SourceError);
    expect(() => parseCatalogPage('<html><script src="https://geo.captcha-delivery.com/x"></script></html>')).toThrow(/CAPTCHA/);
  });
});

describe("Vinted advertentiepagina", () => {
  const ad = parseItemPage(item, "https://www.vinted.nl/items/10554363104-apple-iphone-14-256gb-violett-ladekabel?referrer=catalog", new Date("2026-10-27T10:00:00Z"));
  it("leest omschrijving, kenmerken en foto's", () => {
    expect(ad.externalId).toBe("10554363104");
    expect(ad.url).not.toContain("referrer");
    expect(ad.description).toContain("Batterijconditie 81%");
    expect(ad.askingCents).toBe(29500);
    expect(ad.conditionText).toBe("Heel goed");
    expect(ad.imageUrls).toHaveLength(2);
    expect(ad.attributes).toMatchObject({ vintedStorage: "256 GB", vintedBatteryBucket: "<80%", vintedSimLock: "Ontgrendeld", vintedBrand: "Apple" });
    expect(ad.detailLoaded).toBe(true);
  });
  it("leest verkoper: waardering (0-5), aantal beoordelingen, ID en laatst gezien", () => {
    expect(ad.seller).toMatchObject({ id: "4000001", name: "voorbeeldverkoper", reviewCount: 368, rating: 4.9, business: false, accountAgeMonths: null });
    expect(ad.attributes?.vintedSellerLastSeen).toBe("4 min. geleden");
    expect(ad.location).toBeNull();
  });
  it("leest kopersbescherming, verzendkosten en elektronicaverificatie van de pagina", () => {
    expect(ad.attributes).toMatchObject({ buyerProtection: "yes", buyerProtectionCents: 1545, shippingCents: 569, electronicsVerification: "no", electronicsWarranty: "no" });
  });
  it("zonder prijsopbouw blijven bescherming en verificatie onbekend (niet aangenomen)", () => {
    const bare = parseItemPage(item.split('services\\":{\\"isPickUpOnly').join('x\\":{\\"isPickUpOnly'), "https://www.vinted.nl/items/10554363104-x");
    expect(bare.attributes?.buyerProtection).toBeUndefined();
    expect(bare.attributes?.electronicsVerification).toBeUndefined();
  });
  it("plaatsingstijd uit de relatieve tekst", () => {
    expect(ad.publishedAt?.toISOString()).toBe("2026-10-27T10:00:00.000Z");
    const now = new Date("2026-10-27T10:00:00Z");
    expect(parseUploaded("5 minuten geleden", now)?.toISOString()).toBe("2026-10-27T09:55:00.000Z");
    expect(parseUploaded("2 dagen geleden", now)?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(parseUploaded("onbekend", now)).toBeNull();
    expect(parseUploaded(undefined, now)).toBeNull();
  });
});

describe("zoek-URL", () => {
  it("nieuwste eerst, met prijsgrenzen", () => {
    const u = new URL(catalogUrl("iphone 14", { page: 2, priceFrom: 100, priceTo: 400 }));
    expect(u.pathname).toBe("/catalog");
    expect(u.searchParams.get("search_text")).toBe("iphone 14");
    expect(u.searchParams.get("order")).toBe("newest_first");
    expect(u.searchParams.get("page")).toBe("2");
    expect(u.searchParams.get("price_from")).toBe("100");
    expect(u.searchParams.get("price_to")).toBe("400");
  });
});
