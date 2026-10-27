import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { matchModel } from "./csv";

/** Eén zoekfilter van de klant: een regel uit zijn lijst (model, opslag, conditie, prijsgrenzen, afstand, type advertentie, verkoper). */
export interface SearchFilter {
  id: string;
  modelKey: string;
  /** schermmaat voor iPad Air ("11"/"13"); leeg = alle */
  variant: string;
  /** null = alle opslagen */
  storageGb: number | null;
  condition: FilterCondition;
  minEuro: number;
  maxEuro: number;
  maxKm: number;
  adType: FilterAdType;
  /** informatief; de klant gebruikt overal "Alle" */
  sellerType: string;
  /** minimale tijd dat de verkoper actief is op Marktplaats (maanden) */
  sellerMinMonths: number;
  /** uit = dit model/deze regel doet niet mee zonder de regel te verwijderen */
  active: boolean;
  /** verwachte doorverkoopprijs voor het margefilter; leeg = geen margefilter voor deze regel */
  resaleEuro: number | null;
  /** minimale gewenste winst; leeg = marge per verkoopprijssegment (algemene instelling) */
  minMarginEuro: number | null;
}
export type FilterCondition = "normal" | "broken" | "sealed";
export type FilterAdType = "all" | "withPrice" | "ask";

export const CONDITION_LABEL: Record<FilterCondition, string> = { normal: "Normaal", broken: "Kapot", sealed: "Sealed" };
export const ADTYPE_LABEL: Record<FilterAdType, string> = { all: "Alle", withPrice: "Alle met prijs", ask: "Vraagprijs" };

export const filterSchema = z.object({
  id: z.string().min(1).max(60),
  modelKey: z.string().min(1).max(80),
  variant: z.string().max(20).default(""),
  storageGb: z.number().int().min(1).max(8192).nullable(),
  condition: z.enum(["normal", "broken", "sealed"]).default("normal"),
  minEuro: z.number().finite().min(0).max(20000).default(0),
  maxEuro: z.number().finite().min(0).max(20000),
  maxKm: z.number().finite().min(0).max(5000).default(300),
  adType: z.enum(["all", "withPrice", "ask"]).default("all"),
  sellerType: z.string().max(30).default("Alle"),
  sellerMinMonths: z.number().finite().min(0).max(600).default(0),
  active: z.boolean().default(true),
  resaleEuro: z.number().finite().min(0).max(100000).nullable().default(null),
  minMarginEuro: z.number().finite().min(0).max(100000).nullable().default(null),
});

const KEY = "rules:bbp:filters";

export async function getFilters(): Promise<SearchFilter[]> {
  const row = await prisma.appSettings.findUnique({ where: { key: KEY } });
  const parsed = z.array(filterSchema).safeParse(row?.value);
  return parsed.success ? parsed.data : [];
}

export async function saveFilters(input: unknown, userId?: string, reason = "handmatig"): Promise<SearchFilter[]> {
  const list = z.array(filterSchema).max(5000).parse(input);
  await prisma.appSettings.upsert({ where: { key: KEY }, create: { key: KEY, value: list as unknown as object }, update: { value: list as unknown as object } });
  await prisma.auditLog.create({ data: { userId: userId ?? null, action: "rules.filters_changed", entity: "SearchFilters", meta: { total: list.length, reason } } });
  return list;
}

// ---------- model-namen uit de lijst van de klant → catalogus ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

/** "iPad Air 6 M2 11-inch (2024)" → { modelKey: "ipad-air-m2", variant: "11" }; null als het model niet bekend is. */
export function matchFilterModel(name: string): { modelKey: string; variant: string } | null {
  const n = slug(name.replace(/\(.*?\)/g, (m) => ` ${m.slice(1, -1)} `));
  let m: RegExpMatchArray | null;
  const direct = matchModel(name);
  if (direct) return { modelKey: direct, variant: "" };
  if ((m = /^macbook air (m\d) (\d+) inch$/.exec(n))) return { modelKey: `macbook-air-${m[1]}-${m[2]}`, variant: "" };
  if ((m = /^macbook neo (\d+) inch$/.exec(n))) return { modelKey: `macbook-neo-${m[1]}`, variant: "" };
  if ((m = /^imac (m\d) (\d+) inch$/.exec(n))) return { modelKey: `imac-${m[1]}-${m[2]}`, variant: "" };
  if ((m = /^mac mini (m\d)( pro)?$/.exec(n))) return { modelKey: `mac-mini-${m[1]}${m[2] ? "-pro" : ""}`, variant: "" };
  if ((m = /^apple watch ultra( \d)?$/.exec(n))) return { modelKey: `watch-ultra-${m[1]?.trim() ?? "1"}`, variant: "" };
  if ((m = /^ipad (9|10) \d{4}$/.exec(n))) return { modelKey: `ipad-${m[1]}`, variant: "" };
  if (/^ipad 11 a16/.test(n)) return { modelKey: "ipad-11", variant: "" };
  if ((m = /^ipad mini (\d) \d{4}$/.exec(n))) return { modelKey: `ipad-mini-${m[1]}`, variant: "" };
  if ((m = /^ipad air (4|5) \d{4}$/.exec(n))) return { modelKey: `ipad-air-${m[1]}`, variant: "" };
  if ((m = /^ipad air \d (m\d) (11|13) inch \d{4}$/.exec(n))) return { modelKey: `ipad-air-${m[1]}`, variant: m[2] };
  if ((m = /^ipad pro (11|12\.9) inch (\d{4})$/.exec(n))) {
    const size = m[1] === "11" ? "11" : "12_9";
    const chip = m[2] === "2021" ? "m1" : m[2] === "2022" ? "m2" : m[2];
    return { modelKey: `ipad-pro-${size}-${chip}`, variant: "" };
  }
  if ((m = /^ipad pro (m\d) (11|13) inch \d{4}$/.exec(n))) return { modelKey: `ipad-pro-${m[2]}-${m[1]}`, variant: "" };
  return null;
}

// ---------- plakken / importeren ----------

export interface FilterImport { rows: SearchFilter[]; errors: string[]; unmatched: string[] }

const num = (v: string | undefined) => (v == null || v.trim() === "" ? NaN : Number(v.replace(/[€\s]/g, "").replace(",", ".")));

function parseStorage(v: string): number | null | undefined {
  const t = v.trim().toLowerCase();
  if (!t || t === "alle") return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(gb|tb)$/.exec(t);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Math.round(m[2] === "tb" ? n * 1024 : n);
}

/**
 * Leest de lijst van de klant (tab of puntkomma): Model, Opslag, Conditie, Minimale prijs, Maximale prijs, Maximale afstand,
 * Type advertentie, Type verkoper, Verkoper actief; verdere kolommen (update, e-mail, automatisch bericht) worden genegeerd.
 * Kopregels en groepskoppen ("Apple iPhone") worden overgeslagen.
 */
export function parseFiltersText(text: string): FilterImport {
  const rows: SearchFilter[] = [];
  const errors: string[] = [];
  const unmatched = new Set<string>();
  text.split(/\r?\n/).forEach((line, idx) => {
    const raw = line.trim();
    if (!raw) return;
    const p = raw.split(/\t|;/).map((x) => x.trim());
    if (p.length < 6 || /^model$/i.test(p[0])) return;
    const model = matchFilterModel(p[0]);
    if (!model) { unmatched.add(p[0]); return; }
    const storage = parseStorage(p[1] ?? "");
    const cond = (p[2] ?? "").toLowerCase();
    const condition: FilterCondition | null = cond === "normaal" ? "normal" : cond === "kapot" ? "broken" : cond === "sealed" ? "sealed" : null;
    const adt = (p[6] ?? "alle").toLowerCase();
    const adType: FilterAdType = adt === "vraagprijs" ? "ask" : adt === "alle met prijs" ? "withPrice" : "all";
    const months = /^(\d+)/.exec(p[8] ?? "")?.[1];
    const min = num(p[3]), max = num(p[4]), km = num(p[5]);
    if (storage === undefined) { errors.push(`Regel ${idx + 1}: opslag "${p[1]}" niet herkend`); return; }
    if (!condition) { errors.push(`Regel ${idx + 1}: conditie "${p[2]}" niet herkend`); return; }
    if (!Number.isFinite(max)) { errors.push(`Regel ${idx + 1}: maximale prijs ontbreekt`); return; }
    rows.push({
      id: `${model.modelKey}|${model.variant}|${storage ?? "alle"}|${condition}|${adType}|${rows.length}`,
      modelKey: model.modelKey, variant: model.variant, storageGb: storage, condition,
      minEuro: Number.isFinite(min) ? min : 0, maxEuro: max, maxKm: Number.isFinite(km) ? km : 300, adType,
      sellerType: p[7] || "Alle", sellerMinMonths: months ? Number(months) : 0,
      active: true, resaleEuro: num(p[9]) || null, minMarginEuro: Number.isFinite(num(p[10])) ? num(p[10]) : null,
    });
  });
  return { rows, errors, unmatched: [...unmatched] };
}

// ---------- toepassen op een advertentie ----------

/** Sealed = nieuw/ongeopend, Kapot = defect/onderdelen, anders Normaal. Defect gaat voor sealed. */
export function classifyCondition(text: string, mpCondition: string | null): FilterCondition {
  const t = ` ${text.toLowerCase()} `;
  const c = (mpCondition ?? "").toLowerCase();
  const NOT_BROKEN = /\b(niet|geen|nooit|zonder)\s+(defect|kapot)\b|\bdefectvrij\b/;
  const BROKEN = /\b(defect|kapot|niet werkend|werkt niet|werkt niet meer|voor onderdelen|onderdelen|gebarsten|barst|gebroken|waterschade|vochtschade|icloud[ -]?(lock|vergrendeld)|blocked|geblokkeerd)\b/;
  if (/defect|kapot|niet werkend/.test(c)) return "broken";
  if (BROKEN.test(t.replace(NOT_BROKEN, " "))) return "broken";
  if (/\b(sealed|geseald|ongeopend|verzegeld|in (de )?folie|nog in (de )?(verpakking|folie|doos)|factory sealed|nieuw in doos)\b/.test(t)) return "sealed";
  if (/^nieuw$|^new$|ongebruikt/.test(c.trim())) return "sealed";
  return "normal";
}

export interface FilterAd {
  modelKey: string;
  variant: string;
  storageGb: number | null;
  condition: FilterCondition;
  priceKind: "ask" | "bid" | "both" | "bid0" | "none";
  askEuro: number | null;
  bidEuro: number | null;
}

export type FilterOutcome =
  | { status: "no-filters-for-model" }
  /** step: model-list = geen passende (actieve) regel voor model/opslag/conditie; price-window = prijs of type advertentie past niet */
  | { status: "fail"; step: "model-list" | "price-window"; reasons: string[] }
  | { status: "ok"; filter: SearchFilter; storageAssumed: boolean; notes: string[] };

const eur = (n: number) => `€${n}`;

/** Prijsvenster en type advertentie van één regel (minimum, maximum, vraagprijs/bieden). */
function checkPrice(f: SearchFilter, a: FilterAd): string[] {
  const reasons: string[] = [];
  const hasAsk = a.priceKind === "ask" || a.priceKind === "both";
  const hasPrice = a.priceKind !== "none" && a.priceKind !== "bid0";
  if (f.adType === "ask" && !hasAsk) reasons.push("zoekfilter vraagt een vaste vraagprijs");
  if (f.adType === "withPrice" && !hasPrice) reasons.push("zoekfilter vraagt een advertentie met prijs");
  const prices = [a.askEuro, a.bidEuro].filter((x): x is number => x != null && x > 0);
  if (prices.length) {
    if (!prices.some((p) => p <= f.maxEuro)) reasons.push(`${eur(Math.min(...prices))} is hoger dan de maximumprijs ${eur(f.maxEuro)}`);
    else if (f.minEuro > 0 && prices.every((p) => p < f.minEuro)) reasons.push(`${eur(Math.max(...prices))} is lager dan de minimumprijs ${eur(f.minEuro)}`);
  }
  return reasons;
}

/** Afstand van het zoekfilter (stap "locatie"). */
export function checkFilterDistance(f: SearchFilter, km: number | null): string | null {
  return km != null && km > f.maxKm ? `${km} km is verder dan de ${f.maxKm} km van het zoekfilter` : null;
}

/** Minimale accountleeftijd van het zoekfilter (stap "verkoper"): "ok", "unknown" (leeftijd niet bekend) of een foutmelding. */
export function checkFilterSeller(f: SearchFilter, months: number | null): "ok" | "unknown" | string {
  if (f.sellerMinMonths <= 0) return "ok";
  if (months == null) return "unknown";
  return months < f.sellerMinMonths ? `verkoper is ${months} maanden actief, zoekfilter vraagt ${f.sellerMinMonths}` : "ok";
}

/**
 * Zoekt het zoekfilter waar deze advertentie bij past: model, opslag, conditie en (actief) → prijsvenster en type advertentie.
 * Bij onbekende opslag wordt het gemiddelde van de passende filters gebruikt.
 */
export function evaluateFilters(filters: SearchFilter[], a: FilterAd): FilterOutcome {
  const pool = filters.filter((f) => f.modelKey === a.modelKey && (f.variant === "" || a.variant === "" || f.variant === a.variant));
  if (!pool.length) return { status: "no-filters-for-model" };
  const live = pool.filter((f) => f.active);
  if (!live.length) return { status: "fail", step: "model-list", reasons: ["model staat in de lijst maar is op inactief gezet"] };
  const byCond = live.filter((f) => f.condition === a.condition);
  if (!byCond.length) return { status: "fail", step: "model-list", reasons: [`geen actief zoekfilter voor conditie ${CONDITION_LABEL[a.condition].toLowerCase()}`] };
  const notes: string[] = [];
  let candidates: SearchFilter[];
  let storageAssumed = false;
  if (a.storageGb != null) {
    candidates = byCond.filter((f) => f.storageGb === a.storageGb).concat(byCond.filter((f) => f.storageGb === null));
    if (!candidates.length) return { status: "fail", step: "model-list", reasons: [`geen actief zoekfilter voor ${a.storageGb} GB`] };
  } else {
    storageAssumed = true;
    const avg = (k: "minEuro" | "maxEuro") => Math.round(byCond.reduce((s, f) => s + f[k], 0) / byCond.length);
    const resales = byCond.map((f) => f.resaleEuro).filter((x): x is number => x != null);
    candidates = [{ ...byCond[0], storageGb: null, minEuro: avg("minEuro"), maxEuro: avg("maxEuro"), resaleEuro: resales.length ? Math.round(resales.reduce((s, x) => s + x, 0) / resales.length) : null }];
    notes.push("Opslag onbekend: gemiddelde van de zoekfilters voor dit model gebruikt");
  }
  const failures: string[] = [];
  for (const f of candidates) {
    const r = checkPrice(f, a);
    if (!r.length) return { status: "ok", filter: f, storageAssumed, notes };
    for (const x of r) if (!failures.includes(x)) failures.push(x);
  }
  return { status: "fail", step: "price-window", reasons: failures };
}
