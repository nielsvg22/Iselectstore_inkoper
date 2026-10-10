import { describe, expect, it } from "vitest";
import { APPLE_MODELS, searchPlanFor } from "@/lib/catalog/apple";
import { APPLE_CATEGORIES } from "@/lib/catalog/categories";
import { recognizeByRules } from "@/lib/engines/recognition";
import { searchConfigSchema } from "@/lib/sources/marktplaats-search";

describe("Apple-productcatalogus", () => {
  it("bevat alle productfamilies en meer dan 100 modellen", () => {
    expect(APPLE_MODELS.length).toBeGreaterThan(100);
    const fam = new Set(APPLE_MODELS.map((m) => m.family));
    for (const f of ["iphone", "macbook_air", "macbook_pro", "ipad", "watch", "airpods", "mac_mini", "imac", "mac_studio", "accessory"]) expect(fam.has(f as never)).toBe(true);
  });
  it("sleutels zijn uniek en geldig", () => {
    const keys = APPLE_MODELS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9_]+)*$/);
  });
  it.each(APPLE_MODELS.map((m) => [m.key, m.term] as const))("zoekterm van %s wordt door de herkenning weer als dit model herkend (%s)", (key, term) => {
    expect(recognizeByRules({ title: term }).modelKey).toBe(key);
  });
  it("categoriepaden zijn geldig voor de zoekopdracht", () => {
    for (const m of APPLE_MODELS) expect(searchConfigSchema.safeParse({ queries: [m.term], category: m.category }).success, m.key).toBe(true);
    for (const c of APPLE_CATEGORIES) expect(searchConfigSchema.safeParse({ queries: ["apple"], category: c.path }).success, c.path).toBe(true);
  });
  it("stelt een zoekplan samen uit gekozen modellen", () => {
    expect(searchPlanFor(["iphone-16-pro-max", "iphone-15-pro"])).toEqual({ queries: ["iphone 16 pro max", "iphone 15 pro"], category: "telecommunicatie/mobiele-telefoons-apple-iphone" });
    expect(searchPlanFor(["iphone-15", "macbook-air-m2-13"]).category).toBe("");
    expect(searchPlanFor(["onbekend"])).toEqual({ queries: [], category: "" });
  });
});
