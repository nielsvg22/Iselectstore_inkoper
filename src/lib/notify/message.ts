import { formatEuro } from "../format";
import { BAND_LABEL } from "../engines/scoring";
import type { DealBandKey, RiskLevelKey } from "../types";

export interface DealMessageInput {
  title: string;
  modelLabel: string;
  storageGb?: number | null;
  askingCents: number | null;
  expectedCents: number;
  netProfitCents: number;
  maxBidCents: number;
  roiPct: number;
  score: number;
  band: DealBandKey;
  batteryHealth?: number | null;
  batterySource?: string;
  distanceKm?: number | null;
  riskLevel: RiskLevelKey;
  activationLock?: "locked" | "clear" | null;
  uncertain: boolean;
  url: string;
  appUrl?: string;
  isTest?: boolean;
}

const RISK_NL: Record<RiskLevelKey, string> = { LOW: "Laag", MEDIUM: "Gemiddeld", HIGH: "Hoog", BLOCKED: "Geblokkeerd" };
const HEAD: Record<DealBandKey, string> = {
  TOP: "🔥 TOPDEAL GEVONDEN",
  VERY_INTERESTING: "⭐ ZEER INTERESSANTE DEAL",
  INTERESTING: "👀 INTERESSANTE DEAL",
  MODERATE: "ℹ️ MATIGE DEAL",
  NOT_INTERESTING: "ℹ️ DEAL",
};

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function icloudLabel(v: "locked" | "clear" | null | undefined): string {
  return v === "clear" ? "Vrij volgens verkoper (niet gecontroleerd)" : v === "locked" ? "VERGRENDELD" : "Niet gecontroleerd";
}

export function buildDealMessage(m: DealMessageInput): { html: string; text: string } {
  const name = `${m.modelLabel}${m.storageGb ? ` — ${m.storageGb}GB` : ""}`;
  const lines: string[] = [];
  lines.push(`${m.isTest ? "🧪 TESTMELDING — " : ""}${HEAD[m.band]}`);
  lines.push("");
  lines.push(name);
  lines.push("");
  lines.push(`Vraagprijs: ${formatEuro(m.askingCents)}`);
  lines.push(`Marktwaarde: ${formatEuro(m.expectedCents)}${m.uncertain ? " ⚠️ onzeker" : ""}`);
  lines.push(`Verwachte winst: ${formatEuro(m.netProfitCents)} (${m.roiPct.toFixed(0)}% rendement)`);
  lines.push(`Maximaal bieden: ${formatEuro(m.maxBidCents)}`);
  lines.push(`Deal-score: ${m.score}/100 (${BAND_LABEL[m.band]})`);
  lines.push("");
  if (m.batteryHealth != null) lines.push(`Batterij: ${m.batteryHealth}% ${m.batterySource ?? "volgens verkoper"}`);
  if (m.distanceKm != null) lines.push(`Afstand: ${Math.round(m.distanceKm)} km`);
  lines.push("");
  lines.push(`Risico: ${RISK_NL[m.riskLevel]}`);
  lines.push(`iCloud-status: ${icloudLabel(m.activationLock)}`);
  lines.push("");
  lines.push("Bekijk advertentie:");
  lines.push(m.url);
  const text = lines.join("\n");
  const html = lines.map((l) => (l === m.url ? `<a href="${escapeHtml(m.url)}">Directe advertentielink</a>` : escapeHtml(l))).join("\n");
  return { html, text };
}
