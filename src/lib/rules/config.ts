import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DEFAULT_SCRATCH_FREE_PHRASES, DEFAULT_SCRATCH_PHRASES, IPAD_SEED, type SeedPrice } from "./tables";

const num = (d: number) => z.number().finite().default(d);

const center = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** binnen deze afstand een 📍 tonen */
  flagKm: num(10),
  /** binnen deze afstand extra opvallend (rood) */
  hotKm: num(20),
  /** binnen deze afstand gaat er `bonusEuro` bij de maximale prijs */
  bonusKm: num(10),
  bonusEuro: num(20),
  /** alleen adverteerders binnen deze straal van dit centrum tellen mee (0 = geen eis) */
  onlyWithinKm: num(0),
});

const tier = z.object({
  /** vanaf (maanden actief) */
  fromMonths: z.number().min(0),
  minReviews: z.number().min(0),
  minRating: z.number().min(0).max(5),
  requireVerified: z.boolean().default(false),
});

export const rulesSchema = z.object({
  enabled: z.boolean().default(true),
  /** "sell" = zoekprijs is de verkoopprijs in perfecte staat (nieuwe manier); "buy85" = zoekprijs is max inkoop bij 85% batterij (oude vuistregel). */
  priceBase: z.enum(["sell", "buy85"]).default("sell"),
  /** wat als er geen basisprijs voor model/opslag is: bestaande waardering gebruiken of overslaan */
  unknownBase: z.enum(["fallback", "skip"]).default("fallback"),
  /** Als de regels een oordeel geven vervangen ze het eerdere afstands-/rijtijdbeleid; standaard uit zodat het bestaande beleid blijft gelden */
  replaceDistancePolicy: z.boolean().default(false),
  marginTable: z.enum(["A", "B"]).default("A"),
  /** hoge-marge extra: "same" = de extra van de vraagprijs-kolom voor beide (zoals in het voorbeeld), "table" = eigen kolom per soort */
  highMarginBidMode: z.enum(["same", "table"]).default("same"),
  highMargin: z.object({
    enabled: z.boolean().default(true),
    /** minimale absolute marge (€) om 💰 te krijgen, naast de tabel */
    minAskMarginEuro: num(80),
    minBidMarginEuro: num(100),
    requireKnown: z.array(z.enum(["model", "storage", "distance", "price"])).default(["model", "storage", "distance", "price"]),
  }).default({}),
  battery: z.object({
    excludeBelowPct: num(80),
    /** batterij onbekend → schatten op leeftijd van het model */
    assumeFromAge: z.boolean().default(true),
    fullUntilMonths: num(6),
    dropPerMonthPct: num(1),
    floorPct: num(82),
    /** op welke families de batterijcorrectie geldt */
    families: z.array(z.string()).default(["iphone"]),
  }).default({}),
  scratch: z.object({
    unknownEuro: num(50),
    scratchedEuro: num(100),
    /** alleen bij priceBase "buy85": extra bij krasvrij */
    freeBonusEuro: num(40),
    freePhrases: z.array(z.string()).default(DEFAULT_SCRATCH_FREE_PHRASES),
    scratchPhrases: z.array(z.string()).default(DEFAULT_SCRATCH_PHRASES),
    /** conditie "Nieuw" op Marktplaats telt als krasvrij */
    newCountsAsFree: z.boolean().default(true),
    /** kras-bedragen schalen met de leeftijd van het model: een krasvrije 16 Pro is meer waard dan een krasvrije 13 */
    ageScaling: z.object({
      enabled: z.boolean().default(false),
      /** per maand na release gaat dit percentage van de bedragen af */
      decayPerMonthPct: num(1.5),
      /** ondergrens: nooit minder dan dit percentage van het bedrag */
      minPct: num(50),
    }).default({}),
  }).default({}),
  distance: z.object({
    /** "Verzending meenemen": uit = alleen ophalen binnen `pickupMaxKm` hemelsbreed; verder weg komt er niets doorheen, ook niet bij 5 sterren */
    includeShipping: z.boolean().default(true),
    pickupMaxKm: num(50),
    maxKmDefault: num(300),
    /** nieuwste Pro/Pro Max: nooit verzenden */
    newestProMaxKm: num(50),
    centers: z.array(center).default([
      { name: "Apeldoorn", latitude: 52.2112, longitude: 5.9699, flagKm: 10, hotKm: 20, bonusKm: 10, bonusEuro: 20, onlyWithinKm: 0 },
      { name: "Veenendaal", latitude: 52.0277, longitude: 5.5586, flagKm: 15, hotKm: 15, bonusKm: 10, bonusEuro: 20, onlyWithinKm: 0 },
    ]),
    /** Rijfilter: €/km van de maximale prijs als de verkoper niet aan het verzendfilter voldoet */
    perKmEuro: num(1),
    perKmEnabled: z.boolean().default(true),
    /** hoeveel nieuwste generaties tellen als "nieuwste Pro/Pro Max" */
    newestGenerations: num(1),
  }).default({}),
  shipping: z.object({
    enabled: z.boolean().default(true),
    /** actief op '0 maanden': geen minimale accountleeftijd voor ophalen */
    minSellerMonthsPickup: num(0),
    tiers: z.array(tier).default([
      { fromMonths: 24, minReviews: 30, minRating: 5, requireVerified: true },
      { fromMonths: 36, minReviews: 20, minRating: 4.5, requireVerified: true },
      { fromMonths: 60, minReviews: 8, minRating: 4.5, requireVerified: false },
      { fromMonths: 96, minReviews: 3, minRating: 4.5, requireVerified: false },
      { fromMonths: 120, minReviews: 2, minRating: 4.5, requireVerified: false },
    ]),
    /** onder deze leeftijd nooit verzenden */
    neverBelowMonths: num(24),
  }).default({}),
  minPrice: z.object({
    newerEuro: num(70),
    olderEuro: num(50),
    /** iPhone-generatie vanaf waar 'nieuwer' geldt */
    newerFromGeneration: num(13),
  }).default({}),
  bid: z.object({
    /** bieden vanaf onder dit aandeel van de vraagprijs = door Marktplaats ingevuld → gemiddelde gebruiken */
    minShareOfAsk: num(0.65),
    maxGapEuro: num(250),
    /** alleen bieden vanaf (geen vraagprijs): verwachte prijs bij 'bieden vanaf 0' */
    zeroBidMinusEuro: num(50),
    /** bieden vanaf 0 zonder prijs: filter of alleen markeren */
    zeroBidMode: z.enum(["filter", "annotate"]).default("filter"),
    zeroBid: z.object({
      minBatteryPct: num(85),
      requireScratchFree: z.boolean().default(true),
      requireTrustedOrNearKm: num(20),
    }).default({}),
  }).default({}),
  macbook: z.object({
    excludeIntel: z.boolean().default(true),
    airChips: z.array(z.string()).default(["M1", "M2", "M3", "M4"]),
    airScreens: z.array(z.number()).default([13, 15]),
    ramGb: z.array(z.number()).default([8, 16, 32]),
    ssdGb: z.array(z.number()).default([256, 512, 1024, 2048]),
    /** bedrag erbij per RAM-stap boven de standaardconfiguratie (alleen als ingevuld; 0 = niets erbij) */
    ramBonusEuro: z.record(z.string(), z.number()).default({ "16": 0, "24": 0, "32": 0 }),
    standardRamGb: z.record(z.string(), z.number()).default({ default: 8 }),
  }).default({}),
  ipad: z.object({
    cellularBonusEuro: num(50),
  }).default({}),
  stock: z.object({
    enabled: z.boolean().default(false),
    /** vanaf zoveel op voorraad van een model: alleen hoge-marge deals */
    baseThreshold: num(3),
    /** hogere omloopsnelheid (verkocht in 30 dagen) verhoogt de drempel */
    perSoldLast30d: num(0.5),
  }).default({}),
  monthly: z.object({
    enabled: z.boolean().default(false),
    percent: num(0),
    lastAppliedMonth: z.string().default(""),
  }).default({}),
  /** zoekfilters van de klant (lijst met model/opslag/conditie/prijs/afstand per regel) */
  filters: z.object({
    enabled: z.boolean().default(false),
    /** model dat niet in de lijst staat: afwijzen of de gewone regels laten beslissen */
    outsideList: z.enum(["reject", "ignore"]).default("reject"),
  }).default({}),
  digest: z.object({
    enabled: z.boolean().default(false),
    everyDays: num(14),
    lastSentAt: z.string().default(""),
    /** vanaf welke maand (1-12) we waarschuwen voor een nieuwe iPhone-serie; 0 = uit */
    releaseWarnFromMonth: num(7),
    releaseWarnedYear: num(0),
  }).default({}),
  telegramPurchases: z.object({
    enabled: z.boolean().default(false),
    chatId: z.string().default(""),
    silentDaysAlert: num(3),
  }).default({}),
});
export type RulesConfig = z.infer<typeof rulesSchema>;

export interface BasePrice { modelKey: string; storageGb: number; variant: string; priceEuro: number; kind: "sell" | "buy" }

export const defaultRules = (): RulesConfig => rulesSchema.parse({});

const CONFIG_KEY = "rules:bbp";
const PRICES_KEY = "rules:bbp:prices";
const HISTORY_ACTION = "rules.prices_changed";

export async function getRules(): Promise<RulesConfig> {
  const row = await prisma.appSettings.findUnique({ where: { key: CONFIG_KEY } });
  const parsed = rulesSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : defaultRules();
}

export async function saveRules(input: unknown): Promise<RulesConfig> {
  const next = rulesSchema.parse(input);
  await prisma.appSettings.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: next as object }, update: { value: next as object } });
  return next;
}

const keyOf = (p: { modelKey: string; storageGb: number; variant?: string }) => `${p.modelKey}|${p.storageGb}|${p.variant ?? ""}`;

function seedToBase(s: SeedPrice): BasePrice {
  return { modelKey: s.modelKey, storageGb: s.storageGb, variant: s.variant ?? "", priceEuro: s.priceEuro, kind: s.kind };
}

/** Basisprijzen per model/opslag. Eerste keer: alleen de iPad-lijst uit het document; iPhone/Mac vult de klant zelf in. */
export async function getBasePrices(): Promise<BasePrice[]> {
  const row = await prisma.appSettings.findUnique({ where: { key: PRICES_KEY } });
  const stored = Array.isArray(row?.value) ? (row!.value as unknown as BasePrice[]) : null;
  if (stored) return stored;
  return IPAD_SEED.map(seedToBase);
}

const priceInput = z.object({
  modelKey: z.string().min(1).max(80),
  storageGb: z.number().int().min(0).max(8192),
  variant: z.string().max(20).default(""),
  priceEuro: z.number().finite().min(0).max(20000),
  kind: z.enum(["sell", "buy"]).default("sell"),
});

export async function saveBasePrices(input: unknown, userId?: string, reason = "handmatig"): Promise<BasePrice[]> {
  const list = z.array(priceInput).max(5000).parse(input);
  const seen = new Map<string, BasePrice>();
  for (const p of list) seen.set(keyOf(p), p);
  const next = [...seen.values()].sort((a, b) => a.modelKey.localeCompare(b.modelKey) || a.storageGb - b.storageGb);
  const before = await getBasePrices();
  await prisma.appSettings.upsert({ where: { key: PRICES_KEY }, create: { key: PRICES_KEY, value: next as unknown as object }, update: { value: next as unknown as object } });
  const beforeMap = new Map(before.map((p) => [keyOf(p), p.priceEuro]));
  const changes = next.filter((p) => beforeMap.get(keyOf(p)) !== p.priceEuro).length + before.filter((p) => !seen.has(keyOf(p))).length;
  if (changes) await prisma.auditLog.create({ data: { userId: userId ?? null, action: HISTORY_ACTION, entity: "RulePrices", meta: { changes, reason, total: next.length } } });
  return next;
}

/** Zoekt de basisprijs: exacte variant → zonder variant. */
export function findBasePrice(prices: BasePrice[], modelKey: string, storageGb: number | null, variant = ""): { price: BasePrice | null; storageAssumed: boolean } {
  const pool = prices.filter((p) => p.modelKey === modelKey);
  if (!pool.length) return { price: null, storageAssumed: false };
  const pick = (v: string) => pool.filter((p) => p.variant === v);
  const variants = variant ? [pick(variant), pick("")] : [pick("")];
  for (const set of variants) {
    if (!set.length) continue;
    if (storageGb != null) {
      const hit = set.find((p) => p.storageGb === storageGb);
      if (hit) return { price: hit, storageAssumed: false };
      continue;
    }
    // opslag onbekend: gemiddelde van beschikbare opslagen, duidelijk als aanname gemarkeerd
    const avg = Math.round(set.reduce((s, p) => s + p.priceEuro, 0) / set.length);
    return { price: { ...set[0], storageGb: 0, priceEuro: avg }, storageAssumed: true };
  }
  return { price: null, storageAssumed: false };
}

export { PRICES_KEY, CONFIG_KEY, HISTORY_ACTION };
