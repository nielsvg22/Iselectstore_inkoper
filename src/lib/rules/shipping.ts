import type { RulesConfig } from "./config";

export interface SellerFacts { ageMonths: number | null; reviews: number | null; rating: number | null; verified: boolean | null }
export type ShipStatus = "ok" | "never" | "fail" | "unknown";
export interface ShipResult { status: ShipStatus; reasons: string[]; tier: string | null }

/** Verzendfilter op accountleeftijd, aantal reviews en gemiddelde beoordeling. Ontbrekende gegevens worden nooit verzonnen: dan "unknown". */
export function shippingEligibility(s: SellerFacts, cfg: RulesConfig["shipping"]): ShipResult {
  if (s.ageMonths == null) return { status: "unknown", reasons: ["Accountleeftijd onbekend"], tier: null };
  if (s.ageMonths < cfg.neverBelowMonths) return { status: "never", reasons: [`Account korter dan ${Math.round(cfg.neverBelowMonths / 12 * 10) / 10} jaar actief: nooit laten verzenden`], tier: null };
  const tiers = [...cfg.tiers].sort((a, b) => a.fromMonths - b.fromMonths);
  let tier = null as (typeof tiers)[number] | null;
  for (const t of tiers) if (s.ageMonths >= t.fromMonths) tier = t;
  if (!tier) return { status: "fail", reasons: ["Geen verzendniveau voor deze accountleeftijd"], tier: null };
  const label = `vanaf ${Math.round(tier.fromMonths / 12 * 10) / 10} jaar: ${tier.minReviews}+ reviews, ${String(tier.minRating).replace(".", ",")} sterren${tier.requireVerified ? ", ID geverifieerd" : ""}`;
  const missing: string[] = [];
  if (s.reviews == null) missing.push("aantal reviews onbekend");
  if (s.rating == null) missing.push("beoordeling onbekend");
  if (tier.requireVerified && s.verified == null) missing.push("ID-verificatie onbekend");
  if (missing.length) return { status: "unknown", reasons: missing, tier: label };
  const fails: string[] = [];
  if ((s.reviews ?? 0) < tier.minReviews) fails.push(`${s.reviews} reviews (minimaal ${tier.minReviews})`);
  if ((s.rating ?? 0) < tier.minRating - 0.05) fails.push(`beoordeling ${String(s.rating).replace(".", ",")} (minimaal ${String(tier.minRating).replace(".", ",")})`);
  if (tier.requireVerified && s.verified === false) fails.push("ID niet geverifieerd");
  return fails.length ? { status: "fail", reasons: fails, tier: label } : { status: "ok", reasons: [], tier: label };
}
