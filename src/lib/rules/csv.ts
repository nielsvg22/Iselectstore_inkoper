import { APPLE_MODELS } from "@/lib/catalog/apple";
import type { BasePrice } from "./config";

const norm = (s: string) => s.toLowerCase().replace(/[″"']/g, "").replace(/\s+/g, " ").trim();

/** Zoekt een catalogusmodel op sleutel, label of zoekterm. */
export function matchModel(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  const hit = APPLE_MODELS.find((m) => norm(m.key) === t || norm(m.label) === t || norm(m.term) === t);
  return hit?.key ?? null;
}

export interface CsvResult { rows: BasePrice[]; errors: string[] }

/**
 * Plakt een lijst "model;opslag;prijs[;soort]" (puntkomma of tab) of "model;opslag;variant;prijs[;soort]".
 * Soort is "verkoop" (standaard: prijs in perfecte staat) of "inkoop" (maximale inkoopprijs, zoals de iPad-lijst).
 */
export function parsePriceCsv(text: string): CsvResult {
  const rows: BasePrice[] = [];
  const errors: string[] = [];
  const num = (v: string | undefined) => (v == null || v.trim() === "" ? NaN : Number(v.replace(/[€\s]/g, "").replace(",", ".")));
  text.split(/\r?\n/).forEach((line, idx) => {
    const raw = line.trim();
    if (!raw || /^(model|#)/i.test(raw)) return;
    const parts = raw.split(/[;\t]| {2,}/).map((p) => p.trim());
    const key = matchModel(parts[0]);
    if (!key) { errors.push(`Regel ${idx + 1}: onbekend model "${parts[0]}"`); return; }
    let kind: "sell" | "buy" = "sell";
    if (/^(inkoop|buy|verkoop|sell)$/i.test(parts[parts.length - 1] ?? "")) kind = /^(inkoop|buy)$/i.test(parts.pop()!) ? "buy" : "sell";
    const storage = num(parts[1]);
    const variant = parts.length >= 4 ? parts[2] : "";
    const price = num(parts.length >= 4 ? parts[3] : parts[2]);
    if (!Number.isFinite(storage) || !Number.isFinite(price)) { errors.push(`Regel ${idx + 1}: opslag of prijs ontbreekt`); return; }
    rows.push({ modelKey: key, storageGb: Math.round(storage), variant, priceEuro: price, kind });
  });
  return { rows, errors };
}
