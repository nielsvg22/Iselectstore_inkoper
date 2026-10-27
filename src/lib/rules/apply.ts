import { prisma } from "@/lib/db/client";
import { getBasePrices, getRules, type BasePrice, type RulesConfig } from "./config";
import { getFilters, type SearchFilter } from "./filters";
import { getPhotoAnalysis, photoScratchVerdict } from "@/lib/ai/photos";
import { extractPricesFromText } from "./price-text";
import { evaluateRules, type Verdict, type VerdictInput } from "./verdict";

let cache: { at: number; cfg: RulesConfig; prices: BasePrice[]; filters: SearchFilter[] } | null = null;

/** Regels + basisprijzen, 15 seconden in het geheugen (de worker verwerkt veel advertenties achter elkaar). */
export async function loadRules(force = false): Promise<{ cfg: RulesConfig; prices: BasePrice[]; filters: SearchFilter[] }> {
  if (!force && cache && Date.now() - cache.at < 15_000) return cache;
  const [cfg, prices, filters] = await Promise.all([getRules(), getBasePrices(), getFilters()]);
  cache = { at: Date.now(), cfg, prices, filters };
  return cache;
}
export const clearRulesCache = () => { cache = null; };

export interface AdForRules {
  id?: string;
  source?: string;
  title: string;
  description: string;
  askingPriceCents: number | null;
  distanceKm: number | null;
  sellerVerified: boolean | null;
  sellerSignals: unknown;
  conditionText: string | null;
  rawPayload: unknown;
}

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Zet advertentie + herkenning om in de invoer voor de regelmotor (alleen echte bronwaarden; tekstprijs alleen als er geen prijsinformatie is). */
export function buildVerdictInput(a: {
  ad: AdForRules;
  rec: { modelKey: string; modelLabel: string; family: string; facts: Record<string, { value: unknown; evidence?: string | null }> };
  shipping: string[];
  now?: Date;
  stock?: VerdictInput["stock"];
  photoScratch?: VerdictInput["photoScratch"];
}): { input: VerdictInput; textPrices: { ask: number | null; bid: number | null } | null } {
  const attrs = ((a.ad.rawPayload as { attributes?: Record<string, unknown> } | null)?.attributes ?? {}) as Record<string, unknown>;
  const priceType = typeof attrs.priceType === "string" ? attrs.priceType : null;
  const euro = a.ad.askingPriceCents != null ? a.ad.askingPriceCents / 100 : null;
  let ask: number | null = null;
  let bid: number | null = null;
  if (euro != null && priceType === "MIN_BID") bid = euro;
  else if (euro != null && euro > 0) ask = euro;
  else if (euro === 0 && priceType === "MIN_BID") bid = 0;
  let textPrices: { ask: number | null; bid: number | null } | null = null;
  const text = `${a.ad.title} ${a.ad.description}`;
  if ((ask == null || ask <= 0) && (bid == null || bid <= 0)) {
    const t = extractPricesFromText(text);
    if (t.ask != null || t.bid != null) { textPrices = { ask: t.ask, bid: t.bid }; ask = t.ask; bid = t.bid ?? bid; }
  } else if (bid != null && bid > 0 && ask == null) {
    // alleen bieden vanaf bekend: een uitdrukkelijk genoemde vraagprijs in de tekst erbij nemen
    const t = extractPricesFromText(text);
    if (t.ask != null && t.evidence.some((e) => /^(vraagprijs|vaste prijs)/.test(e))) { textPrices = { ask: t.ask, bid: null }; ask = t.ask; }
  }
  const f = (k: string) => a.rec.facts[k]?.value;
  const sig = (a.ad.sellerSignals ?? {}) as { rating?: number | null; reviewCount?: number | null; accountAgeMonths?: number | null };
  const traits = typeof attrs.traits === "string" ? attrs.traits.split(",") : [];
  const input: VerdictInput = {
    modelKey: a.rec.modelKey,
    modelLabel: a.rec.modelLabel,
    family: a.rec.family,
    storageGb: numOrNull(f("storageGb")),
    ramGb: numOrNull(f("ramGb")),
    chip: typeof f("chip") === "string" ? (f("chip") as string) : null,
    screenInch: numOrNull(f("screenInch")),
    connectivity: typeof f("connectivity") === "string" ? (f("connectivity") as string) : null,
    batteryPct: numOrNull(f("batteryHealth")),
    text,
    mpCondition: typeof attrs.condition === "string" ? attrs.condition : a.ad.conditionText,
    priceType,
    askEuro: ask,
    bidEuro: bid,
    latitude: numOrNull(attrs.locationLatitude),
    longitude: numOrNull(attrs.locationLongitude),
    distanceKm: a.ad.distanceKm,
    shippingOffered: a.shipping.includes("shipping"),
    seller: { ageMonths: numOrNull(sig.accountAgeMonths), reviews: numOrNull(sig.reviewCount), rating: numOrNull(sig.rating), verified: a.ad.sellerVerified },
    directBuy: traits.includes("SHOPPING_CART") || /\bdirect\s+kopen\b/i.test(a.ad.title),
    now: a.now ?? new Date(),
    stock: a.stock ?? null,
    photoScratch: a.photoScratch ?? null,
    platform: a.ad.source === "vinted" ? "vinted" : "marktplaats",
    title: a.ad.title,
    country: typeof attrs.country === "string" ? attrs.country : null,
    buyerProtection: attrs.buyerProtection === "yes" ? true : attrs.buyerProtection === "no" ? false : null,
    electronicsVerification: attrs.electronicsVerification === "yes" ? true : attrs.electronicsVerification === "no" ? false : null,
    listedProtectionCents: numOrNull(attrs.buyerProtectionCents),
    listedShippingCents: numOrNull(attrs.shippingCents),
    batteryEvidence: typeof a.rec.facts.batteryHealth?.evidence === "string" ? a.rec.facts.batteryHealth.evidence : null,
  };
  return { input, textPrices };
}

/** Voorraad (gekocht, nog niet verkocht) en verkocht in de afgelopen 30 dagen voor een model. */
export async function stockFor(modelKey: string): Promise<{ count: number; sold30d: number }> {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [count, sold30d] = await Promise.all([
    prisma.purchase.count({ where: { modelKey, status: { in: ["BOUGHT", "LISTED"] } } }),
    prisma.sale.count({ where: { soldAt: { gte: since }, purchase: { modelKey } } }),
  ]);
  return { count, sold30d };
}

export async function evaluateForAd(a: Parameters<typeof buildVerdictInput>[0]): Promise<{ verdict: Verdict; textPrices: { ask: number | null; bid: number | null } | null; cfg: RulesConfig }> {
  const { cfg, prices, filters } = await loadRules();
  const stock = cfg.stock.enabled && a.stock === undefined ? await stockFor(a.rec.modelKey) : a.stock;
  const photoScratch = a.photoScratch !== undefined ? a.photoScratch : a.ad.id ? photoScratchVerdict(await getPhotoAnalysis(a.ad.id)) : null;
  const { input, textPrices } = buildVerdictInput({ ...a, stock, photoScratch });
  return { verdict: evaluateRules(input, prices, cfg, filters), textPrices, cfg };
}

/** Als "verzending meenemen" uit staat: tot hoeveel km (hemelsbreed) er maximaal opgehaald wordt; anders null. */
export async function pickupOnlyKm(): Promise<number | null> {
  const { cfg } = await loadRules();
  return cfg.enabled && !cfg.distance.includeShipping ? cfg.distance.pickupMaxKm : null;
}

/** Beoordeelt een opgeslagen advertentie opnieuw met de huidige regels (voor de beslisboom en controles). Slaat niets op. */
export async function evaluateAdById(adId: string): Promise<{ title: string; url: string; verdict: Verdict } | null> {
  const ad = await prisma.advertisement.findUnique({ where: { id: adId }, include: { product: { include: { specs: true } } } });
  if (!ad?.product) return null;
  const specs = Object.fromEntries(ad.product.specs.filter((s) => s.value !== "onbekend").map((s) => [s.key, { value: /^\d+(\.\d+)?$/.test(s.value) ? Number(s.value) : s.value }]));
  const { cfg, prices, filters } = await loadRules();
  const stock = cfg.stock.enabled ? await stockFor(ad.product.modelKey) : null;
  const { input } = buildVerdictInput({ ad, rec: { modelKey: ad.product.modelKey, modelLabel: ad.product.modelLabel, family: ad.product.family, facts: specs }, shipping: (ad.shippingOptions as string[]) ?? [], stock, photoScratch: photoScratchVerdict(await getPhotoAnalysis(ad.id)) });
  return { title: ad.title, url: ad.url, verdict: evaluateRules(input, prices, cfg, filters) };
}
