import type { AppConfig } from "@/lib/config/schema";
import type { DealBandKey, Family } from "@/lib/types";

export interface ScoreInput {
  roiPct: number;
  netProfitCents: number;
  conservativeProfitCents: number;
  valuationConfidence: number;
  valuationUncertain: boolean;
  sampleSize: number;
  conditionGrade: "A" | "B" | "C" | null;
  batteryHealth: number | null;
  knownFactRatio: number; // 0..1
  family: Family;
  riskScore: number;
  blocked: boolean;
  needsManualReview: boolean;
  activationUnverified: boolean;
  recognitionConfidence: number;
  /** Geen vaste vraagprijs (bieden / op aanvraag): winst en score zijn niet te bepalen */
  priceUnknown?: boolean;
}

export interface ScoreFactor {
  key: "roi" | "profit" | "certainty" | "condition" | "sellability" | "risk";
  label: string;
  value: number; // 0..1
  weight: number;
  points: number; // bijdrage in punten
}

export interface ScoreResult {
  score: number;
  band: DealBandKey;
  blocked: boolean;
  factors: ScoreFactor[];
  adjustments: Array<{ label: string; delta?: number; cap?: number }>;
  rawScore: number;
  explanation: string;
}

const FAMILY_PRIOR: Record<Family, number> = {
  iphone: 0.95,
  macbook_air: 0.8,
  macbook_pro: 0.75,
  macbook: 0.7,
  ipad: 0.7,
  watch: 0.55,
  airpods: 0.6,
  mac_mini: 0.55,
  imac: 0.5,
  mac_studio: 0.45,
  accessory: 0.4,
  unknown: 0.2,
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function bandFor(score: number, cfg: AppConfig): DealBandKey {
  const b = cfg.scoring.bands;
  if (score >= b.top) return "TOP";
  if (score >= b.veryInteresting) return "VERY_INTERESTING";
  if (score >= b.interesting) return "INTERESTING";
  if (score >= b.moderate) return "MODERATE";
  return "NOT_INTERESTING";
}

export const BAND_LABEL: Record<DealBandKey, string> = {
  TOP: "Topdeal",
  VERY_INTERESTING: "Zeer interessant",
  INTERESTING: "Interessant",
  MODERATE: "Matig",
  NOT_INTERESTING: "Niet interessant",
};

export function scoreDeal(i: ScoreInput, cfg: AppConfig): ScoreResult {
  const t = cfg.targets;
  const w = cfg.scoring.weights;

  // Winst die meetelt: bij lage zekerheid schuift de basis richting het conservatieve scenario
  const trust = clamp(i.valuationConfidence / 0.6);
  const effProfit = i.conservativeProfitCents + (i.netProfitCents - i.conservativeProfitCents) * trust;
  const effRoiFactor = i.netProfitCents > 0 ? (effProfit / Math.max(1, i.netProfitCents)) * i.roiPct : i.roiPct;

  const roiF = effProfit <= 0 ? 0 : clamp(effRoiFactor / Math.max(1, 2 * t.minRoiPct));
  const profF = effProfit <= 0 ? 0 : clamp(effProfit / Math.max(1, 2 * t.minProfitCents));
  const certF = clamp(i.valuationConfidence);

  const gradeScore = i.conditionGrade === "A" ? 1 : i.conditionGrade === "B" ? 0.8 : i.conditionGrade === "C" ? 0.5 : 0.6;
  const batScore = i.batteryHealth == null ? 0.5 : clamp((i.batteryHealth - 70) / 30);
  const condF = clamp(gradeScore * 0.6 + batScore * 0.2 + clamp(i.knownFactRatio) * 0.2);

  const depth = clamp(i.sampleSize / (cfg.valuation.minComparables * 3));
  const sellF = clamp(FAMILY_PRIOR[i.family] * 0.6 + depth * 0.4);

  const divisor = t.riskTolerance === "low" ? 60 : t.riskTolerance === "medium" ? 100 : 140;
  const riskF = clamp(1 - i.riskScore / divisor);

  const defs: Array<[ScoreFactor["key"], string, number, number]> = [
    ["roi", "Verwacht rendement", roiF, w.roi],
    ["profit", "Verwachte winst in euro's", profF, w.profit],
    ["certainty", "Zekerheid marktwaarde", certF, w.certainty],
    ["condition", "Productconditie", condF, w.condition],
    ["sellability", "Verkoopbaarheid", sellF, w.sellability],
    ["risk", "Advertentierisico (laag = goed)", riskF, w.risk],
  ];
  const totalW = defs.reduce((a, d) => a + d[3], 0) || 1;
  const factors: ScoreFactor[] = defs.map(([key, label, value, weight]) => ({ key, label, value, weight, points: (value * weight * 100) / totalW }));
  const raw = factors.reduce((a, f) => a + f.points, 0);

  let score = raw;
  const adjustments: ScoreResult["adjustments"] = [];

  if (i.activationUnverified) {
    const pen = t.riskTolerance === "low" ? 8 : t.riskTolerance === "medium" ? 4 : 2;
    score -= pen;
    adjustments.push({ label: "iCloud-/activatieslotstatus niet gecontroleerd", delta: -pen });
  }
  const cap = (label: string, c: number) => {
    if (score > c) score = c;
    adjustments.push({ label, cap: c });
  };
  if (i.valuationUncertain) cap("Marktwaarde onzeker: score begrensd", 74);
  else if (i.valuationConfidence < 0.55) cap("Matige zekerheid marktwaarde: geen topdeal", 89);
  if (i.needsManualReview) cap("Handmatige controle vereist: score begrensd", 74);
  if (i.recognitionConfidence < 0.5) cap("Productherkenning onzeker", 59);
  if (i.family === "unknown") cap("Product niet herkend", 30);
  if (i.netProfitCents <= 0) cap("Geen verwachte winst", 39);
  else if (i.conservativeProfitCents <= 0) cap("Conservatief scenario geeft verlies: geen topdeal", 89);

  if (i.priceUnknown && !i.blocked) {
    score = 0;
    adjustments.push({ label: "Geen vaste vraagprijs (bieden/op aanvraag): winst niet te bepalen", cap: 0 });
  }
  if (i.blocked) {
    score = 0;
    adjustments.push({ label: "Risicoblokkade: niet kopen zonder handmatige verificatie", cap: 0 });
  }
  score = Math.round(clamp(score, 0, 100) * 1) ;
  const band = bandFor(score, cfg);

  const parts: string[] = [];
  parts.push(`Score ${score}/100 (${BAND_LABEL[band]}).`);
  if (i.blocked) parts.push("Deze advertentie heeft een risicoblokkade en krijgt daarom score 0.");
  else {
    const best = [...factors].sort((a, b) => b.value * b.weight - a.value * a.weight)[0];
    const worst = [...factors].sort((a, b) => a.value * a.weight - b.value * b.weight)[0];
    parts.push(`Sterkste factor: ${best.label.toLowerCase()} (${Math.round(best.value * 100)}%). Zwakste: ${worst.label.toLowerCase()} (${Math.round(worst.value * 100)}%).`);
    if (i.valuationConfidence < 0.6) parts.push("Door beperkte zekerheid over de marktwaarde weegt het conservatieve winstscenario zwaarder mee.");
    for (const a of adjustments) parts.push(a.cap != null ? `Begrenzing: ${a.label}.` : `Aftrek ${a.delta}: ${a.label}.`);
  }
  return { score, band, blocked: i.blocked, factors, adjustments, rawScore: Math.round(raw), explanation: parts.join(" ") };
}
