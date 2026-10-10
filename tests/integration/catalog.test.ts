import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }, lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { prisma } from "@/lib/db/client";
import { aggregateCategories, getAppleCategories, parseCategoryFacets, refreshAppleCategories } from "@/lib/sources/category-discovery";
import { APPLE_CATEGORIES } from "@/lib/catalog/categories";
import { resetDb } from "../helpers";
import { saveConfig } from "@/lib/settings/store";

const cat = (id: number, key: string, label: string, parentKey: string | false, count?: number) => ({ id, key, label, parentKey, histogramCount: count });
const page = (cats: unknown[]) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { searchRequestAndResponse: { facets: [{ key: "PriceCents" }, { key: "RelevantCategories", categories: cats }] } } } })}</script></html>`;

const FACETS = [
  cat(820, "telecommunicatie", "Telecommunicatie", false),
  cat(1953, "mobiele-telefoons-apple-iphone", "Mobiele telefoons | Apple iPhone", "telecommunicatie", 19985),
  cat(91, "auto-s", "Auto's", false),
  cat(157, "volkswagen", "Volkswagen", "auto-s", 12839),
  cat(2, "boeken-engels", "Taal | Engels", "boeken", 1985),
  cat(3, "apple-macbooks", "Apple Macbooks", "computers-en-software", 4415),
  cat(4, "toetsenborden", "Toetsenborden", "computers-en-software", 863),
  cat(5, "kleintjes", "Iets kleins", "computers-en-software", 5),
];

beforeEach(resetDb);

describe("Apple-categorieën van Marktplaats", () => {
  it("leest categoriefacetten uit de zoekpagina en geeft een duidelijke fout bij een gewijzigde pagina", () => {
    expect(parseCategoryFacets(page(FACETS))).toHaveLength(FACETS.length);
    expect(() => parseCategoryFacets("<html></html>")).toThrow(/geen leesbare/);
  });

  it("houdt alleen relevante Apple-categorieën over (geen auto's of boeken) en deelt ze in apparaten/accessoires", () => {
    const r = aggregateCategories([parseCategoryFacets(page(FACETS)), parseCategoryFacets(page(FACETS))]);
    expect(r.map((c) => c.path)).toEqual(["telecommunicatie/mobiele-telefoons-apple-iphone", "computers-en-software/apple-macbooks", "computers-en-software/toetsenborden"]);
    expect(r.map((c) => c.group)).toEqual(["device", "device", "accessory"]);
    expect(r[0].label).toBe("Apple iPhone");
    expect(r[0].count).toBe(19985 * 2);
  });

  it("zonder opgehaalde lijst valt de app terug op de ingebouwde lijst", async () => {
    const r = await getAppleCategories();
    expect(r.source).toBe("ingebouwd");
    expect(r.categories).toEqual(APPLE_CATEGORIES);
  });

  it("haalt de lijst live-conform op (alleen toegestane paden), bewaart hem en gebruikt hem daarna", async () => {
    await saveConfig({ limits: { minSecondsBetweenRequests: 0 } });
    const paths: string[] = [];
    const f = (async (u: string) => {
      const url = new URL(u);
      paths.push(url.pathname);
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /lrp/api/search*\nDisallow: /search?q=*");
      return new Response(page(FACETS));
    }) as unknown as typeof fetch;
    const r = await refreshAppleCategories({ fetchImpl: f, gapMs: 0 });
    expect(r.source).toBe("marktplaats");
    expect(r.categories.length).toBe(3);
    expect(paths.filter((p) => p.startsWith("/q/")).length).toBe(13);
    for (const p of paths) expect(p).toMatch(/^\/(robots\.txt|q\/[a-z0-9+]+\/)$/);
    const again = await getAppleCategories();
    expect(again.source).toBe("marktplaats");
    expect(again.fetchedAt).toBeTruthy();
    expect(await prisma.appSettings.count({ where: { key: "catalog:categories" } })).toBe(1);
  });

  it("bij geweigerde toegang wordt niets overschreven en niets omzeild", async () => {
    await saveConfig({ limits: { minSecondsBetweenRequests: 0 } });
    const f = (async (u: string) => (new URL(u).pathname === "/robots.txt" ? new Response("User-agent: *") : new Response("nee", { status: 429 }))) as unknown as typeof fetch;
    await expect(refreshAppleCategories({ fetchImpl: f, gapMs: 0 })).rejects.toThrow(/weigert toegang/);
    expect((await getAppleCategories()).source).toBe("ingebouwd");
  });
});
