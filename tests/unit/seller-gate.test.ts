import { describe, expect, it } from "vitest";
import { defaultRules } from "@/lib/rules/config";
import { sellerDropReason, type SellerFacts, type SellerGate } from "@/lib/radar/seller-gate";
import { shippingEligibility } from "@/lib/rules/shipping";
import { buildPrefilter } from "@/lib/sources/prefilter";
import type { RawAd } from "@/lib/sources/types";

const rules = defaultRules();
const NOW = new Date("2026-11-15T12:00:00Z");
const gate = (rep: Record<string, SellerFacts> = {}, platform: "marktplaats" | "vinted" = "marktplaats"): SellerGate => ({
  platform, reputation: new Map(Object.entries(rep)), distance: rules.distance, shipping: rules.shipping, vintedSeller: rules.vintedSeller, now: NOW,
});
const ad = (o: Partial<RawAd> & { km?: number | null; seller?: RawAd["seller"] } = {}): RawAd => ({ externalId: "m1", url: "u", title: "iPhone 15 Pro 256GB", imageUrls: [], distanceKm: o.km ?? null, seller: o.seller ?? { id: "s1" }, ...o } as RawAd);
const f = (ageMonths: number | null, reviews: number | null, rating: number | null, verified: boolean | null = true): SellerFacts => ({ ageMonths, reviews, rating, verified });

describe("verzendfilter van Twan (afstand-review-experiences), letterlijk", () => {
  const st = (a: number | null, r: number | null, s: number | null, v: boolean | null) => shippingEligibility({ ageMonths: a, reviews: r, rating: s, verified: v }, rules.shipping).status;
  it("minder dan 2 jaar actief: nooit laten verzenden", () => { expect(st(23, 500, 5, true)).toBe("never"); expect(st(0, 500, 5, true)).toBe("never"); });
  it("2 tot 3 jaar: 30+ reviews, 5 ster, ID geverifieerd", () => {
    expect(st(24, 30, 5, true)).toBe("ok"); expect(st(35, 30, 5, true)).toBe("ok");
    expect(st(24, 29, 5, true)).toBe("fail"); expect(st(24, 30, 4.4, true)).toBe("fail"); expect(st(24, 30, 5, false)).toBe("fail");
  });
  it("3 tot 5 jaar: 20+ reviews, 4,5 ster, ID geverifieerd", () => {
    expect(st(36, 20, 4.5, true)).toBe("ok"); expect(st(59, 20, 4.5, true)).toBe("ok");
    expect(st(36, 19, 4.5, true)).toBe("fail"); expect(st(36, 20, 4.4, true)).toBe("fail"); expect(st(36, 20, 4.5, false)).toBe("fail");
  });
  it("5 tot 8 jaar: 8+ reviews, 4,5 ster", () => { expect(st(60, 8, 4.5, null)).toBe("ok"); expect(st(95, 8, 4.5, null)).toBe("ok"); expect(st(60, 7, 4.5, null)).toBe("fail"); });
  it("8 tot 10 jaar: 3+ reviews, 4,5 ster", () => { expect(st(96, 3, 4.5, null)).toBe("ok"); expect(st(119, 3, 4.5, null)).toBe("ok"); expect(st(96, 2, 4.5, null)).toBe("fail"); });
  it("10+ jaar: 2+ reviews, 4,5 ster", () => { expect(st(120, 2, 4.5, null)).toBe("ok"); expect(st(240, 1, 4.9, null)).toBe("fail"); expect(st(120, 2, 4.4, null)).toBe("fail"); });
});

describe("al bij het zoeken: afstand en betrouwbare verkoper (Marktplaats)", () => {
  it("dichtbij (tot 50 km) is er geen eis aan de verkoper", () => {
    expect(sellerDropReason(ad({ km: 30 }), "iphone-15-pro", gate({ s1: f(6, 0, 3) }))).toBeNull();
    expect(sellerDropReason(ad({ km: 50 }), "iphone-15-pro", gate({ s1: f(6, 0, 3) }))).toBeNull();
  });
  it("vanaf 50 km: een bekende onbetrouwbare verkoper valt af, een betrouwbare niet", () => {
    expect(sellerDropReason(ad({ km: 120 }), "iphone-15-pro", gate({ s1: f(30, 12, 5) }))).toBe("verkoper-niet-betrouwbaar"); // 2–3 jaar maar maar 12 reviews
    expect(sellerDropReason(ad({ km: 120 }), "iphone-15-pro", gate({ s1: f(12, 500, 5) }))).toBe("verkoper-niet-betrouwbaar"); // minder dan 2 jaar
    expect(sellerDropReason(ad({ km: 120 }), "iphone-15-pro", gate({ s1: f(70, 9, 4.6, null) }))).toBeNull(); // 5–8 jaar, 8+ reviews
  });
  it("onbekende verkoper komt altijd door (het oordeel beslist later)", () => {
    expect(sellerDropReason(ad({ km: 120 }), "iphone-15-pro", gate())).toBeNull();
    expect(sellerDropReason(ad({ km: 120 }), "iphone-15-pro", gate({ s1: f(null, null, null, null) }))).toBeNull();
    expect(sellerDropReason(ad({ km: null }), "iphone-15-pro", gate({ s1: f(6, 0, 3) }))).toBeNull(); // afstand onbekend
  });
  it("anonieme verkopers delen één ID en worden nooit als één verkoper behandeld", () => {
    const anon = ad({ km: 120, seller: { id: "1", anonymous: true } });
    expect(sellerDropReason(anon, "iphone-15-pro", gate({ "1": f(6, 0, 3) }))).toBeNull();
  });
  it("gegevens uit het zoekresultaat zelf gaan voor het geheugen", () => {
    const own = ad({ km: 120, seller: { id: "s1", accountAgeMonths: 130, reviewCount: 5, rating: 4.8 } });
    expect(sellerDropReason(own, "iphone-15-pro", gate({ s1: f(6, 0, 3) }))).toBeNull(); // 10+ jaar, 2+ reviews
  });
  it("nieuwste Pro/Pro Max: nooit verder dan 50 km, andere modellen tot 300 km", () => {
    expect(sellerDropReason(ad({ km: 80 }), "iphone-18-pro", gate({ s1: f(130, 50, 5) }))).toBe("te-ver");
    expect(sellerDropReason(ad({ km: 80 }), "iphone-16-pro", gate({ s1: f(130, 50, 5) }))).toBeNull();
    expect(sellerDropReason(ad({ km: 301 }), "iphone-16-pro", gate({ s1: f(130, 50, 5) }))).toBe("te-ver");
  });
});

describe("al bij het zoeken: Vinted (beoordeling en aantal reviews)", () => {
  it("4,5 sterren en 8 reviews; onbekend komt door (het oordeel sluit dat uit)", () => {
    const g = gate({ low: f(null, 3, 4.9), stars: f(null, 50, 4.2), good: f(null, 9, 4.6), none: f(null, null, null) }, "vinted");
    expect(sellerDropReason(ad({ seller: { id: "low" } }), null, g)).toBe("verkoper-niet-betrouwbaar");
    expect(sellerDropReason(ad({ seller: { id: "stars" } }), null, g)).toBe("verkoper-niet-betrouwbaar");
    expect(sellerDropReason(ad({ seller: { id: "good" } }), null, g)).toBeNull();
    expect(sellerDropReason(ad({ seller: { id: "none" } }), null, g)).toBeNull();
    expect(sellerDropReason(ad({ seller: { id: "nieuw" } }), null, g)).toBeNull();
  });
});

describe("in het voorselectiefilter", () => {
  it("telt de reden mee en laat de rest door", () => {
    const dropped: string[] = [];
    const flt = buildPrefilter({ op: "AND", children: [] }, { accessories: rules.accessories, scope: { allowedModelKeys: null, minIphoneGeneration: 14, minPrice: rules.minPrice, sellers: gate({ s1: f(130, 1, 4.9) }) }, onDrop: (r) => dropped.push(r) })!;
    expect(flt(ad({ km: 90, askingCents: 60000 }))).toBe(false); // 10+ jaar maar 1 review
    expect(flt(ad({ km: 20, askingCents: 60000 }))).toBe(true); // dichtbij: ophalen
    expect(dropped).toEqual(["verkoper-niet-betrouwbaar"]);
  });
});
