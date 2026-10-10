import type { Family, Recognition, RiskFlag, RiskLevelKey, SignalCode } from "@/lib/types";

export interface RiskInput {
  recognition: Recognition;
  photoCount: number;
  descriptionLength: number;
  askingCents: number | null;
  /** Verwachte verkoopprijs en betrouwbaarheid (optioneel) voor "te mooi om waar te zijn" */
  expectedCents?: number | null;
  valuationConfidence?: number | null;
}

export interface RiskResult {
  level: RiskLevelKey;
  score: number;
  flags: RiskFlag[];
  blocked: boolean;
  needsManualReview: boolean;
  reviewReasons: string[];
}

const SIGNAL_FLAGS: Partial<Record<SignalCode, { label: string; severity: RiskFlag["severity"]; points: number; review?: boolean }>> = {
  ACTIVATION_LOCK: { label: "Activatieslot / iCloud-vergrendeling vermeld", severity: "block", points: 100 },
  MDM: { label: "MDM / beheerd apparaat vermeld", severity: "block", points: 100 },
  STOLEN_MENTION: { label: "Verwijzing naar gestolen product", severity: "block", points: 100 },
  OWNERSHIP_UNCLEAR: { label: "Onduidelijke eigendomssituatie", severity: "block", points: 100 },
  BLOCKED_IMEI: { label: "IMEI geblokkeerd / geblacklist", severity: "block", points: 100 },
  FOR_PARTS: { label: "Alleen voor onderdelen aangeboden", severity: "block", points: 100 },
  WATER_DAMAGE: { label: "Water-/vochtschade", severity: "block", points: 100 },
  SEVERE_DEFECT: { label: "Ernstig defect vermeld", severity: "block", points: 100 },
  PREPAYMENT_REQUEST: { label: "Verdachte betaalwijze (vooruitbetalen / buitenland / betaallink)", severity: "high", points: 40, review: true },
  PROMPT_INJECTION: { label: "Advertentietekst bevat instructies gericht aan een AI-systeem (genegeerd)", severity: "high", points: 30, review: true },
  ACTIVATION_MENTIONED_UNCLEAR: { label: "iCloud/Zoek-mijn genoemd maar status onduidelijk", severity: "warn", points: 18, review: true },
  SIMLOCK: { label: "Simlock vermeld", severity: "warn", points: 10 },
  NON_ORIGINAL_PARTS: { label: "Niet-originele of onbekende onderdelen", severity: "warn", points: 15 },
  REPAIRED: { label: "Eerder gerepareerd", severity: "warn", points: 8 },
  NO_PURCHASE_PROOF: { label: "Geen aankoopbewijs", severity: "warn", points: 8 },
  SCREEN_DAMAGE: { label: "Schermschade (reparatiekosten ingecalculeerd)", severity: "warn", points: 10 },
  BACK_DAMAGE: { label: "Schade achterkant (reparatiekosten ingecalculeerd)", severity: "warn", points: 8 },
  CAMERA_DAMAGE: { label: "Cameraschade (reparatiekosten ingecalculeerd)", severity: "warn", points: 10 },
  COSMETIC_DAMAGE: { label: "Cosmetische gebruikssporen", severity: "info", points: 2 },
  BATTERY_SERVICE: { label: "Batterij vervangen / service", severity: "info", points: 0 },
};

const ACTIVATION_RELEVANT: Family[] = ["iphone", "ipad", "macbook", "macbook_air", "macbook_pro", "mac_mini", "imac", "mac_studio", "watch"];

export function assessRisk(input: RiskInput): RiskResult {
  const flags: RiskFlag[] = [];
  const reasons: string[] = [];
  const rec = input.recognition;
  for (const s of rec.signals) {
    const def = SIGNAL_FLAGS[s.code];
    if (!def) continue;
    flags.push({ code: s.code, label: def.label, severity: def.severity, points: def.points, evidence: s.evidence });
    if (def.review) reasons.push(def.label);
  }

  if (input.photoCount === 0) flags.push({ code: "NO_PHOTOS", label: "Geen foto's", severity: "warn", points: 12 });
  if (input.descriptionLength < 40) flags.push({ code: "THIN_DESCRIPTION", label: "Zeer korte beschrijving, weinig informatie", severity: "warn", points: 6 });

  const bat = rec.facts.batteryHealth?.value;
  if (typeof bat === "number" && bat < 80) flags.push({ code: "LOW_BATTERY", label: `Lage batterijconditie (${bat}%)`, severity: "warn", points: 8 });

  if (ACTIVATION_RELEVANT.includes(rec.family) && !rec.facts.activationLock) {
    flags.push({ code: "ACTIVATION_UNVERIFIED", label: "iCloud-/activatieslotstatus niet vermeld of gecontroleerd", severity: "info", points: 5 });
  }

  if (input.expectedCents && input.askingCents != null && (input.valuationConfidence ?? 0) >= 0.5 && input.askingCents < input.expectedCents * 0.55 && input.askingCents > 0) {
    flags.push({ code: "PRICE_TOO_GOOD", label: "Vraagprijs ver onder marktwaarde — controleer op oplichting of verborgen gebreken", severity: "warn", points: 20 });
    reasons.push("Vraagprijs ver onder marktwaarde");
  }

  if (rec.confidence < 0.5) reasons.push("Productherkenning onzeker");

  const blocked = flags.some((f) => f.severity === "block");
  const score = Math.min(100, flags.reduce((a, f) => a + (f.severity === "block" ? 0 : f.points), 0) + (blocked ? 60 : 0));
  const level: RiskLevelKey = blocked ? "BLOCKED" : score >= 45 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";
  const needsManualReview = !blocked && reasons.length > 0;
  return { level, score, flags, blocked, needsManualReview, reviewReasons: reasons };
}
