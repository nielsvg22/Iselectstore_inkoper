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
  location?: string | null;
  riskLevel: RiskLevelKey;
  activationLock?: "locked" | "clear" | null;
  uncertain: boolean;
  url: string;
  appUrl?: string;
  isTest?: boolean;
  adId?: string;
  /** false = voorlopig: essentiële gegevens ontbreken of vragen controle; dan nooit als "topdeal" gemeld */
  definitive?: boolean;
  provisionalReasons?: string[];
}

const RISK_NL: Record<RiskLevelKey, string> = {
  LOW: "Laag",
  MEDIUM: "Gemiddeld",
  HIGH: "Hoog",
  BLOCKED: "Geblokkeerd",
};
const HEAD: Record<DealBandKey, string> = {
  TOP: "🔥 TOPDEAL GEVONDEN",
  VERY_INTERESTING: "⭐ ZEER INTERESSANTE DEAL",
  INTERESTING: "👀 INTERESSANTE DEAL",
  MODERATE: "ℹ️ MATIGE DEAL",
  NOT_INTERESTING: "ℹ️ DEAL",
};

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function icloudLabel(v: "locked" | "clear" | null | undefined): string {
  return v === "clear"
    ? "Vrij volgens verkoper (niet gecontroleerd)"
    : v === "locked"
      ? "VERGRENDELD"
      : "Niet gecontroleerd";
}

export function buildDealMessage(m: DealMessageInput): {
  html: string;
  text: string;
} {
  const name = `${m.modelLabel}${m.storageGb ? ` — ${m.storageGb}GB` : ""}`;
  const lines: string[] = [];
  const provisional = m.definitive === false;
  const head = provisional
    ? m.band === "TOP" || m.band === "VERY_INTERESTING"
      ? "🔶 MOGELIJK INTERESSANTE DEAL (voorlopig)"
      : "🔶 VOORLOPIGE DEAL"
    : HEAD[m.band];
  lines.push(`${m.isTest ? "🧪 TESTMELDING — " : ""}${head}`);
  if (provisional && m.provisionalReasons?.length)
    lines.push(`Controleer eerst: ${m.provisionalReasons.join("; ")}`);
  lines.push("");
  lines.push(name);
  lines.push("");
  lines.push(`Vraagprijs: ${formatEuro(m.askingCents)}`);
  lines.push(
    `Marktwaarde: ${formatEuro(m.expectedCents)}${m.uncertain ? " ⚠️ onzeker" : ""}`,
  );
  lines.push(
    `Verwachte winst: ${formatEuro(m.netProfitCents)} (${m.roiPct.toFixed(0)}% rendement)`,
  );
  lines.push(`Maximaal bieden: ${formatEuro(m.maxBidCents)}`);
  lines.push(`Deal-score: ${m.score}/100 (${BAND_LABEL[m.band]})`);
  lines.push("");
  if (m.batteryHealth != null)
    lines.push(
      `Batterij: ${m.batteryHealth}% ${m.batterySource ?? "volgens verkoper"}`,
    );
  if (m.distanceKm != null)
    lines.push(`Afstand: ${Math.round(m.distanceKm)} km`);
  lines.push("");
  lines.push(`Risico: ${RISK_NL[m.riskLevel]}`);
  lines.push(`iCloud-status: ${icloudLabel(m.activationLock)}`);
  lines.push("");
  lines.push("Bekijk advertentie:");
  lines.push(m.url);
  const text = lines.join("\n");
  const html = lines
    .map((l) =>
      l === m.url
        ? `<a href="${escapeHtml(m.url)}">Directe advertentielink</a>`
        : escapeHtml(l),
    )
    .join("\n");
  return { html, text };
}

export function buildPushPayload(
  m: DealMessageInput,
  portalPath: string,
): {
  title: string;
  body: string;
  url: string;
  tag: string;
  externalUrl?: string;
  isTest?: boolean;
  provisional?: boolean;
} {
  const name = `${m.modelLabel}${m.storageGb ? ` ${m.storageGb}GB` : ""}`;
  const provisional = m.definitive === false;
  const prefix = m.isTest
    ? "Test · "
    : provisional
      ? "Voorlopig · "
      : m.band === "TOP"
        ? "Topdeal · "
        : "";
  const lines = [
    `${formatEuro(m.askingCents)}${m.location ? ` · ${m.location}` : ""}${m.distanceKm != null ? ` · ${Math.round(m.distanceKm)} km` : " · afstand onbekend"}`,
    m.uncertain
      ? "Winst nog onzeker"
      : `Geschatte winst ${formatEuro(m.netProfitCents)} · Score ${m.score}`,
  ];
  if (provisional && m.provisionalReasons?.length)
    lines.push(`Controleer: ${m.provisionalReasons.join(", ")}`);
  return {
    title: `${prefix}${name}`,
    body: lines.join("\n"),
    url: portalPath,
    tag: m.adId ? `ad-${m.adId}` : "deal",
    externalUrl: m.url,
    isTest: m.isTest,
    provisional,
  };
}
