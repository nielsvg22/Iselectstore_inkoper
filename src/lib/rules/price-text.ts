/**
 * Prijs uit titel en omschrijving halen — alleen als de advertentie zelf geen prijsinformatie heeft.
 * Volgorde (zoals in de regels van Best Buy Phone):
 *  1. expliciete "bieden vanaf …" / "biedingen onder …" → bieden vanaf
 *  2. "vraagprijs/vp/vaste prijs/richtprijs/gewenst bedrag/prijs …" → vraagprijs
 *  3. "onder/minder dan … gaat niet weg" → vraagprijs (zonder biedtaal), "minimaal …" → vraagprijs
 *  4. eerste bedrag met € / euro / ",-" → vraagprijs
 * Er wordt niets gegokt: zonder herkenbaar bedrag blijft de uitkomst leeg.
 */
export interface TextPrices { ask: number | null; bid: number | null; evidence: string[] }

const AMT = String.raw`(?:€\s*)?(\d{1,3}(?:\.\d{3})+|\d{1,5})(?:,-|,\d{2}|,–)?`;
const toNum = (s: string) => Number(s.replace(/\./g, ""));

const BID_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bbied(?:en|ing(?:en)?)\s*(?:van\s*af|vanaf|v\.a\.)\s*${AMT}`, "g"),
  new RegExp(String.raw`\b(?:bied(?:en|ing(?:en)?)|bod)\s+(?:mag\s+)?(?:maar\s+)?(?:niet\s+)?(?:serieus\s+)?(?:onder|beneden|lager\s+dan|minder\s+dan)\s+(?:de\s+)?${AMT}`, "g"),
  new RegExp(String.raw`\b(?:geen|niet)\s+(?:serieuze\s+)?(?:bied(?:en|ing(?:en)?)|bod)\s+(?:onder|beneden)\s+(?:de\s+)?${AMT}`, "g"),
  new RegExp(String.raw`\b(?:bod|bieding)\s*(?:van\s*af|vanaf)\s*${AMT}`, "g"),
];

const ASK_KEYWORD = new RegExp(
  String.raw`\b(?:vraagprijs|vraag\s*prijs|vp|v\.p\.|richtprijs|gewenst\s+bedrag|vaste\s+prijs|vastprijs|prijs\s+vast|minimale\s+vraagprijs|laatste\s+prijs|prijs)\b(?:(?!bied|bod)[^0-9€]){0,18}?${AMT}`,
  "g",
);
const ASK_AFTER = new RegExp(String.raw`${AMT}\s*(?:euro|eur|€)?\s*(?:vaste\s+prijs|vast\b|vp\b)`, "g");
const ASK_MIN = new RegExp(String.raw`\b(?:minimaal|minimum|min\.)\s+${AMT}`, "g");
const ASK_UNDER = new RegExp(String.raw`(?:^|[^a-z])(?:onder|beneden|minder\s+dan|lager\s+dan)\s+(?:de\s+)?${AMT}\s*(?:euro|eur|€)?\s*(?:gaat|wordt|word|niet|gereageerd)`, "g");
const NOT_UNIT = String.raw`(?!\s*(?:gb|tb|%|inch|"|mah|cm|mm|jaar|maanden|mnd|stuks?))`;
const ASK_WEG_STRICT = new RegExp(String.raw`\b(?:voor|ophalen\s+voor)\s+${AMT}\s*(?:euro|eur|€|,-)`, "g");
const ASK_WEG_LOOSE = new RegExp(String.raw`\b(?:mag\s+(?:ie\s+|hij\s+|die\s+)?weg\s+voor|gaat\s+niet\s+weg\s+onder|samen\s+ophalen|los)\s+${AMT}${NOT_UNIT}`, "g");
const EURO_TOKEN = new RegExp(String.raw`(?:€\s*(\d{1,3}(?:\.\d{3})+|\d{1,5})(?:,-|,\d{2})?)|(?:(\d{1,3}(?:\.\d{3})+|\d{2,5})(?:,\d{2})?\s*(?:euro\b|eur\b|€(?!\s*\d)|,-|,–))`, "g");

function first(text: string, re: RegExp): { value: number; hit: string } | null {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return null;
  const n = toNum(m[1]);
  return n >= 1 && n <= 20000 ? { value: n, hit: m[0].trim() } : null;
}

export function extractPricesFromText(raw: string): TextPrices {
  const text = " " + raw.toLowerCase().replace(/\s+/g, " ").replace(/€\s+/g, "€") + " ";
  const out: TextPrices = { ask: null, bid: null, evidence: [] };

  for (const re of BID_PATTERNS) {
    const h = first(text, re);
    if (h) { out.bid = h.value; out.evidence.push(`bieden vanaf: "${h.hit}"`); break; }
  }
  const askTries: Array<[RegExp, string]> = [[ASK_KEYWORD, "vraagprijs"], [ASK_AFTER, "vaste prijs"]];
  // zonder biedtaal ook "minimaal …", "onder … gaat niet weg", "mag weg voor …"
  if (out.bid == null) askTries.push([ASK_MIN, "minimaal"], [ASK_UNDER, "ondergrens"], [ASK_WEG_LOOSE, "mag weg voor"], [ASK_WEG_STRICT, "voor"]);
  for (const [re, label] of askTries) {
    const h = first(text, re);
    if (h) { out.ask = h.value; out.evidence.push(`${label}: "${h.hit}"`); break; }
  }
  if (out.ask == null && out.bid == null) {
    EURO_TOKEN.lastIndex = 0;
    const m = EURO_TOKEN.exec(text);
    if (m) {
      const n = toNum(m[1] ?? m[2]);
      if (n >= 5 && n <= 20000) { out.ask = n; out.evidence.push(`bedrag: "${m[0].trim()}"`); }
    }
  } else if (out.ask == null && out.bid != null) {
    // alleen bieden vanaf genoemd: er is dan geen betrouwbare vraagprijs
  }
  return out;
}
