export const APELDOORN = { latitude: 52.2112, longitude: 5.9699 };

/** Hemelsbreed vanaf centrum Apeldoorn; geen routeafstand. Geen geocoding op basis van namen. */
export function distanceFromApeldoorn(
  latitude: unknown,
  longitude: unknown,
): number | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  const rad = (v: number) => (v * Math.PI) / 180;
  const a =
    Math.sin(rad(latitude - APELDOORN.latitude) / 2) ** 2 +
    Math.cos(rad(APELDOORN.latitude)) *
      Math.cos(rad(latitude)) *
      Math.sin(rad(longitude - APELDOORN.longitude) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) * 10) / 10;
}

export interface PurchasePolicy {
  radiusKm: number;
  maxDriveMinutes?: number;
  minRating: number;
  minReviews: number;
  minAgeMonths: number;
}
export const defaultPurchasePolicy: PurchasePolicy = {
  radiusKm: 40,
  minRating: 4.6,
  minReviews: 15,
  minAgeMonths: 12,
};
export function purchaseStatus(
  i: {
    distanceKm: number | null;
    driveSeconds?: number | null;
    shipping: boolean;
    rating?: number | null;
    reviews?: number | null;
    ageMonths?: number | null;
    blocked: boolean;
    suspicious?: boolean;
  },
  p = defaultPurchasePolicy,
) {
  if (i.blocked || i.suspicious)
    return { key: "excluded", label: "Risico — uitsluiten" } as const;
  const driving = p.maxDriveMinutes != null;
  const value = driving ? i.driveSeconds : i.distanceKm;
  const limit = driving ? p.maxDriveMinutes! * 60 : p.radiusKm;
  const known = typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (known && value <= limit)
    return { key: "local", label: "Lokaal ophalen" } as const;
  if (
    known && value > limit &&
    i.shipping &&
    i.rating != null &&
    Number.isFinite(i.rating) && i.rating >= p.minRating &&
    i.rating <= 5 &&
    i.reviews != null &&
    Number.isInteger(i.reviews) && i.reviews >= p.minReviews &&
    i.ageMonths != null &&
    Number.isFinite(i.ageMonths) && i.ageMonths >= p.minAgeMonths
  )
    return { key: "shipping", label: "Betrouwbare verzending" } as const;
  // Verder dan het ophaalgebied en een bewezen te jong account: verzenden is geen optie (accountleeftijd komt uit de detailpagina)
  if (
    known && value > limit &&
    i.ageMonths != null && Number.isFinite(i.ageMonths) && i.ageMonths < p.minAgeMonths
  )
    return { key: "young", label: "Account te nieuw voor verzending" } as const;
  return { key: "review", label: "Verkoper controleren" } as const;
}
