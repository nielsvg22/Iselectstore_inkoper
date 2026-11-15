import { prisma } from "../db/client";
import type { RawAd } from "../sources/types";
import type { RulesConfig } from "../rules/config";
import { isNewestPro } from "../rules/release";
import { shippingEligibility } from "../rules/shipping";

export interface SellerFacts { ageMonths: number | null; reviews: number | null; rating: number | null; verified: boolean | null }

export interface SellerGate {
  platform: "marktplaats" | "vinted";
  /** laatst bekende gegevens per verkoper-ID (uit eerder opgeslagen advertenties) */
  reputation: ReadonlyMap<string, SellerFacts>;
  distance: RulesConfig["distance"];
  shipping: RulesConfig["shipping"];
  vintedSeller: RulesConfig["vintedSeller"];
  now: Date;
}

const MONTH_MS = 30.44 * 86_400_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Onthoudt per verkoper wat we eerder over hem hebben gezien (aantal reviews, sterren, accountleeftijd, ID-verificatie).
 * Zo kan een bekende, niet-betrouwbare verkoper al bij het zoeken worden overgeslagen, zonder dat er een detailpagina wordt opgehaald.
 * De accountleeftijd wordt aangevuld met de tijd sinds we hem zagen (leeftijd loopt alleen op).
 */
export async function loadSellerReputation(platform: "marktplaats" | "vinted", now = new Date()): Promise<Map<string, SellerFacts>> {
  const rows = await prisma.advertisement.findMany({
    where: { source: platform, sellerId: { not: null } },
    select: { sellerId: true, sellerVerified: true, sellerSignals: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: 50_000,
  });
  const out = new Map<string, SellerFacts>();
  for (const r of rows) {
    if (!r.sellerId) continue;
    const s = (r.sellerSignals ?? {}) as { rating?: unknown; reviewCount?: unknown; accountAgeMonths?: unknown; anonymous?: unknown };
    if (s.anonymous === true) continue; // anonieme verkopers delen één ID: nooit samenvoegen
    const age = num(s.accountAgeMonths);
    const grown = age == null ? null : age + Math.max(0, Math.floor((now.getTime() - r.updatedAt.getTime()) / MONTH_MS));
    const prev = out.get(r.sellerId);
    // een nieuwere advertentie van dezelfde verkoper wint, maar een bekende waarde wordt niet door "onbekend" overschreven
    out.set(r.sellerId, {
      ageMonths: grown ?? prev?.ageMonths ?? null,
      reviews: num(s.reviewCount) ?? prev?.reviews ?? null,
      rating: num(s.rating) ?? prev?.rating ?? null,
      verified: r.sellerVerified ?? prev?.verified ?? null,
    });
  }
  return out;
}

/**
 * Waarom een advertentie al bij het zoeken wordt overgeslagen vanwege afstand of verkoper (null = doorlaten).
 * Zelfde regels als het oordeel (Twans verzendfilter), maar alleen als de gegevens er zeker zijn: onbekend komt altijd door.
 */
export function sellerDropReason(ad: RawAd, modelKey: string | null, g: SellerGate): string | null {
  const own: Partial<SellerFacts> = { ageMonths: num(ad.seller?.accountAgeMonths), reviews: num(ad.seller?.reviewCount), rating: num(ad.seller?.rating), verified: typeof ad.seller?.verified === "boolean" ? ad.seller.verified : null };
  const cached = ad.seller?.id && ad.seller.anonymous !== true ? g.reputation.get(ad.seller.id) : undefined;
  const facts: SellerFacts = {
    ageMonths: own.ageMonths ?? cached?.ageMonths ?? null,
    reviews: own.reviews ?? cached?.reviews ?? null,
    rating: own.rating ?? cached?.rating ?? null,
    verified: own.verified ?? cached?.verified ?? null,
  };

  if (g.platform === "vinted") {
    const vs = g.vintedSeller;
    if (facts.rating != null && vs.minRating > 0 && facts.rating < vs.minRating) return "verkoper-niet-betrouwbaar";
    if (facts.reviews != null && vs.minReviews > 0 && facts.reviews < vs.minReviews) return "verkoper-niet-betrouwbaar";
    return null;
  }

  const km = ad.distanceKm;
  if (km == null) return null;
  const d = g.distance;
  const newestPro = modelKey ? isNewestPro(modelKey, g.now, d) : false;
  if (km > (newestPro ? d.newestProMaxKm : d.maxKmDefault)) return "te-ver";
  if (km > d.pickupMaxKm) {
    if (!d.includeShipping) return "te-ver";
    if (g.shipping.enabled) {
      const s = shippingEligibility(facts, g.shipping).status;
      if (s === "never" || s === "fail") return "verkoper-niet-betrouwbaar";
    }
  }
  return null;
}
