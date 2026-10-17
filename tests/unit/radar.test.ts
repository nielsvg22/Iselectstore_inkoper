import { describe, expect, it } from "vitest";
import {
  APELDOORN,
  distanceFromApeldoorn,
  purchaseStatus,
} from "@/lib/radar/safety";
import { apeldoornRadarTree, shippingRadarTree } from "@/lib/radar/apeldoorn";
import { evaluate, type FilterContext } from "@/lib/engines/filters";

describe("Apeldoorn inkoopveiligheid", () => {
  it("rekent vanaf Apeldoorn, verwerpt ongeldige coördinaten", () => {
    expect(distanceFromApeldoorn(APELDOORN.latitude, APELDOORN.longitude)).toBe(
      0,
    );
    expect(distanceFromApeldoorn(52.09, 5.12)).toBeGreaterThan(55);
    expect(distanceFromApeldoorn(undefined, undefined)).toBeNull();
    expect(distanceFromApeldoorn(900, 5)).toBeNull();
    expect(distanceFromApeldoorn(NaN, 5)).toBeNull();
  });
  it("keurt verzending nooit goed zonder alle brongegevens", () => {
    const ad = {
      distanceKm: 41,
      shipping: true,
      rating: 4.6,
      reviews: 15,
      ageMonths: 12,
      blocked: false,
    };
    expect(purchaseStatus(ad).key).toBe("shipping");
    for (const missing of [
      "rating",
      "reviews",
      "ageMonths",
      "distanceKm",
    ] as const)
      expect(purchaseStatus({ ...ad, [missing]: null }).key).toBe("review");
    expect(purchaseStatus({ ...ad, rating: 4.5 }).key).toBe("review");
    expect(purchaseStatus({ ...ad, shipping: false }).key).toBe("review");
    expect(purchaseStatus({ ...ad, suspicious: true }).key).toBe("excluded");
    expect(purchaseStatus({ ...ad, distanceKm: 40 }).key).toBe("local");
  });
  it("houdt onbekende gegevens zichtbaar, maar keurt ze niet goed voor verzending", () => {
    const ctx = {
      family: "iphone",
      blocked: false,
      distanceKm: null,
      sellerRating: null,
    } as FilterContext;
    expect(evaluate(apeldoornRadarTree, ctx)).toBe(true);
    expect(evaluate(shippingRadarTree, ctx)).toBe(false);
    expect(evaluate(apeldoornRadarTree, { ...ctx, blocked: true })).toBe(false);
  });
});

it("gebruikt platformcoördinaten en claimt geen reviews als ze ontbreken", async () => {
  const { mapSearchListing } = await import("@/lib/sources/marktplaats-search");
  const ad = mapSearchListing({
    itemId: "m123456",
    title: "iPhone",
    vipUrl: "/v/m123456-test",
    location: {
      cityName: "Apeldoorn",
      latitude: APELDOORN.latitude,
      longitude: APELDOORN.longitude,
      distanceMeters: 999999,
    },
    sellerInformation: { isVerified: true },
    traits: ["SELLER_PROFILE_URL"],
  });
  expect(ad?.distanceKm).toBe(0);
  expect(ad?.seller?.rating).toBeNull();
  expect(ad?.seller?.business).toBeNull();
});
