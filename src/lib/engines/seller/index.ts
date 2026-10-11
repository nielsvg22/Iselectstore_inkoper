import type { RiskFlag } from "@/lib/types";

/** Herkomst van een gegeven: nooit "bevestigd" claimen als de bron dat niet levert. */
export type Provenance = "CONFIRMED" | "SELLER_STATED" | "ESTIMATED" | "UNKNOWN";
export const PROVENANCE_LABEL: Record<Provenance, string> = { CONFIRMED: "Bevestigd", SELLER_STATED: "Volgens verkoper", ESTIMATED: "Automatisch ingeschat", UNKNOWN: "Onbekend" };

export interface SellerInput {
  /** Door het platform geleverd (zoekresultaat/detailpagina); null = niet geleverd */
  verified?: boolean | null;
  business?: boolean | null;
  anonymous?: boolean | null;
  /** Beschikbaar op detailpagina; in de zoekresultaten van Marktplaats NIET aanwezig → blijft onbekend */
  rating?: number | null;
  reviewCount?: number | null;
  accountAgeMonths?: number | null;
  salesHistoryCount?: number | null;
  photoCount: number;
  descriptionLength: number;
  askingCents: number | null;
  expectedCents?: number | null;
  valuationConfidence?: number | null;
  riskFlags: RiskFlag[];
  shipping: string[];
}

export interface SellerSignal {
  code: string;
  label: string;
  effect: number;
  provenance: Provenance;
  detail?: string;
}

export interface SellerAssessment {
  score: number;
  level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  signals: SellerSignal[];
  /** Gegevens die we niet hebben (altijd benoemd, nooit als positief meegeteld) */
  unknown: string[];
  confirmedSignals: number;
  summary: string;
}

const BASE = 40;

/**
 * Uitlegbare betrouwbaarheidsscore (0–100) op basis van verifieerbare signalen.
 * Uitgangspunt: de score start neutraal-laag (40); alleen bevestigde signalen kunnen hem boven 65 brengen.
 * Ontbrekende gegevens tellen nooit als positief. Niveau HIGH vereist minimaal één door het platform bevestigd signaal.
 */
export function assessSeller(i: SellerInput): SellerAssessment {
  const signals: SellerSignal[] = [];
  const unknown: string[] = [];
  const add = (s: SellerSignal) => signals.push(s);
  const has = (code: string) => i.riskFlags.some((f) => f.code === code);

  if (i.verified === true) add({ code: "VERIFIED", label: "Door Marktplaats als geverifieerd aangemerkt", effect: 25, provenance: "CONFIRMED" });
  else if (i.verified === false) add({ code: "NOT_VERIFIED", label: "Verkoper is niet geverifieerd", effect: 0, provenance: "CONFIRMED", detail: "Niet geverifieerd is niet hetzelfde als onbetrouwbaar" });
  else unknown.push("Verificatiestatus verkoper");

  if (i.business === true) add({ code: "BUSINESS", label: "Zakelijke verkoper (bedrijfsprofiel)", effect: 10, provenance: "CONFIRMED" });
  if (i.anonymous === true) add({ code: "ANONYMOUS", label: "Anoniem verkoopprofiel (geen naam zichtbaar)", effect: -5, provenance: "CONFIRMED" });

  if (typeof i.rating === "number" && typeof i.reviewCount === "number" && i.reviewCount > 0) {
    const eff = i.reviewCount >= 5 ? Math.round((i.rating - 3) * 8) : Math.round((i.rating - 3) * 3);
    add({ code: "RATING", label: `Beoordeling ${i.rating.toFixed(1)}/5 (${i.reviewCount}×)`, effect: eff, provenance: "CONFIRMED" });
  } else unknown.push("Beoordelingen");
  if (typeof i.accountAgeMonths === "number") add({ code: "ACCOUNT_AGE", label: `Account ${i.accountAgeMonths} maanden oud`, effect: i.accountAgeMonths >= 24 ? 8 : i.accountAgeMonths < 3 ? -10 : 2, provenance: "CONFIRMED" });
  else unknown.push("Accountleeftijd");
  if (typeof i.salesHistoryCount === "number") add({ code: "SALES", label: `${i.salesHistoryCount} eerdere verkopen zichtbaar`, effect: i.salesHistoryCount >= 10 ? 8 : 0, provenance: "CONFIRMED" });
  else unknown.push("Verkoopverleden");

  // Automatisch ingeschatte signalen uit de advertentie zelf (nooit "bevestigd")
  if (i.photoCount >= 4) add({ code: "PHOTOS_OK", label: `${i.photoCount} foto's`, effect: 6, provenance: "ESTIMATED" });
  else if (i.photoCount === 0) add({ code: "NO_PHOTOS", label: "Geen foto's", effect: -15, provenance: "ESTIMATED" });
  else if (i.photoCount < 2) add({ code: "FEW_PHOTOS", label: "Slechts één foto", effect: -6, provenance: "ESTIMATED" });
  if (i.descriptionLength >= 150) add({ code: "DETAILED", label: "Uitgebreide omschrijving", effect: 5, provenance: "ESTIMATED" });
  else if (i.descriptionLength < 40) add({ code: "THIN", label: "Zeer korte omschrijving", effect: -10, provenance: "ESTIMATED" });
  if (has("PREPAYMENT_REQUEST")) add({ code: "PAYMENT_RISK", label: "Risicovolle betaal-/verzendvoorwaarden in tekst", effect: -40, provenance: "ESTIMATED" });
  if (has("PROMPT_INJECTION")) add({ code: "SUSPICIOUS_TEXT", label: "Verdachte advertentietekst (instructies aan AI)", effect: -20, provenance: "ESTIMATED" });
  if (has("PRICE_TOO_GOOD")) add({ code: "PRICE_TOO_GOOD", label: "Ongebruikelijk lage prijs t.o.v. marktwaarde", effect: -20, provenance: "ESTIMATED" });
  if (has("NO_PURCHASE_PROOF")) add({ code: "NO_PROOF", label: "Geen aankoopbewijs vermeld", effect: -4, provenance: "SELLER_STATED" });

  const raw = BASE + signals.reduce((a, s) => a + s.effect, 0);
  const score = Math.max(0, Math.min(100, raw));
  const confirmedPositive = signals.filter((s) => s.provenance === "CONFIRMED" && s.effect > 0).length;
  const confirmedSignals = signals.filter((s) => s.provenance === "CONFIRMED").length;
  let level: SellerAssessment["level"] = score >= 70 && confirmedPositive > 0 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  // Zonder enig bevestigd signaal en zonder negatieve signalen: eerlijk "onbekend" in plaats van "gemiddeld"
  if (confirmedPositive === 0 && !signals.some((s) => s.effect <= -15)) level = "UNKNOWN";
  const label = { HIGH: "Voldoende onderbouwd", MEDIUM: "Matig onderbouwd", LOW: "Laag / risicosignalen", UNKNOWN: "Onvoldoende gegevens" }[level];
  const summary = `${label} (${score}/100). ${confirmedSignals ? `${confirmedSignals} bevestigd signaal${confirmedSignals > 1 ? "en" : ""}.` : "Geen bevestigde signalen."}${unknown.length ? ` Onbekend: ${unknown.join(", ").toLowerCase()}.` : ""}`;
  return { score, level, signals, unknown, confirmedSignals, summary };
}
