import { formatEuro } from "../format";
import { BAND_LABEL } from "../engines/scoring";
import type { DealBandKey, RiskLevelKey } from "../types";
import { FLAG_EMOJI } from "../rules/verdict";

/** Samenvatting van het oordeel van de inkoopregels, zoals opgeslagen bij de analyse. */
export interface RulesSummary {
  status: "reject" | "review" | "match" | "high" | "skip";
  flags: string[];
  maxSellEuro: number | null;
  allowedAsk: number | null;
  allowedBid: number | null;
  highAsk: number | null;
  highBid: number | null;
  effectiveEuro: number | null;
  marginEuro: number | null;
  priceKind: string;
  lines: Array<{ label: string; euro: number }>;
  notes: string[];
  reasons: string[];
  battery: { pct: number | null; assumed: boolean };
  baseKind: "sell" | "buy" | null;
}

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
  driveSeconds?: number | null;
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
  rules?: RulesSummary | null;
}

const eur0 = (n: number | null | undefined) => (n == null ? "?" : `€${Math.round(n)}`);

/** Emoji-samenvatting voor onderwerp/titel, bijv. "📍✨💰". */
export function rulesEmoji(r: RulesSummary | null | undefined): string {
  if (!r) return "";
  const order = ["hot", "near", "scratchFree", "scratched", "high", "directBuy", "sellerCheck", "bid0"];
  const parts = order.filter((f) => r.flags.includes(f) && !(f === "near" && r.flags.includes("hot"))).map((f) => FLAG_EMOJI[f]);
  return parts.join("");
}

/** Uitleg zoals in de meldingen van Best Buy Phone: max verkoopprijs, toegestane prijzen, hoge marge. */
export function rulesLines(r: RulesSummary): string[] {
  if (r.maxSellEuro == null) return r.notes.slice(0, 2);
  const out: string[] = [];
  const base = r.lines[0];
  const rest = r.lines.slice(1).map((l) => `${l.euro < 0 ? "−" : "+"} ${eur0(Math.abs(l.euro))} ${l.label.toLowerCase()}`);
  out.push(`${r.baseKind === "buy" ? "Max inkoopprijs" : "Max verkoopprijs"}: ${eur0(r.maxSellEuro)}${base ? ` = ${eur0(base.euro)}${rest.length ? " " + rest.join(" ") : ""}` : ""}`);
  if (r.baseKind === "sell") {
    out.push(`Toegestane vraagprijs: ${eur0(r.allowedAsk)} · bieden vanaf: ${eur0(r.allowedBid)}`);
    if (r.highAsk != null) out.push(`Hoge marge 💰: vraag ≤ ${eur0(r.highAsk)} · bieden ≤ ${eur0(r.highBid)}`);
  } else out.push(`Toegestane prijs: ${eur0(r.allowedAsk)}`);
  if (r.marginEuro != null) out.push(`Marge op deze prijs: ${eur0(r.marginEuro)}`);
  if (r.battery.assumed && r.battery.pct != null) out.push(`Batterij onbekend: ${r.battery.pct}% aangenomen`);
  if (r.flags.includes("storageUnknown")) out.push("Opslag onbekend (?): gemiddelde prijs gebruikt");
  if (r.flags.includes("sellerCheck")) out.push("Verkoper handmatig controleren");
  return out;
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
  if (m.driveSeconds != null) lines.push(`Geschatte rijtijd: ${Math.ceil(m.driveSeconds / 60)} min vanaf Apeldoorn`);
  if (m.distanceKm != null)
    lines.push(`Afstand: ${Math.round(m.distanceKm)} km`);
  lines.push("");
  lines.push(`Risico: ${RISK_NL[m.riskLevel]}`);
  lines.push(`iCloud-status: ${icloudLabel(m.activationLock)}`);
  if (m.rules && m.rules.status !== "skip") {
    lines.push("");
    for (const l of rulesLines(m.rules)) lines.push(l);
  }
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
    `${formatEuro(m.askingCents)}${m.location ? ` · ${m.location}` : ""}${m.driveSeconds != null ? ` · ±${Math.ceil(m.driveSeconds / 60)} min rijden` : m.distanceKm != null ? ` · ${Math.round(m.distanceKm)} km` : " · afstand onbekend"}`,
    m.uncertain
      ? "Winst nog onzeker"
      : `Geschatte winst ${formatEuro(m.netProfitCents)} · Score ${m.score}`,
  ];
  if (provisional && m.provisionalReasons?.length)
    lines.push(`Controleer: ${m.provisionalReasons.join(", ")}`);
  if (m.rules && m.rules.status !== "skip" && m.rules.maxSellEuro != null) {
    lines.splice(1, 1, `Max ${eur0(m.rules.maxSellEuro)} · toegestaan vraag ${eur0(m.rules.allowedAsk)} / bieden ${eur0(m.rules.allowedBid)}${m.rules.marginEuro != null ? ` · marge ${eur0(m.rules.marginEuro)}` : ""}`);
  }
  return {
    title: `${prefix}${name}${m.rules?.flags.includes("storageUnknown") ? "?" : ""}${rulesEmoji(m.rules) ? " " + rulesEmoji(m.rules) : ""}`,
    body: lines.join("\n"),
    url: portalPath,
    tag: m.adId ? `ad-${m.adId}` : "deal",
    externalUrl: m.url,
    isTest: m.isTest,
    provisional,
  };
}
