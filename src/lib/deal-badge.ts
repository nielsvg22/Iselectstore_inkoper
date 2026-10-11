export type BadgeTone = "success" | "info" | "warning" | "neutral";
export interface DealBadgeInfo {
  label: string;
  tone: BadgeTone;
  icon: "thumb" | "flame";
}

export interface BadgeInput {
  score: number;
  blocked: boolean;
  askingCents: number;
  expectedCents: number;
  netProfitCents: number;
  ageMinutes: number;
  topScore: number;
}

/** Procentueel verschil met de marktprijs: positief = onder marktprijs. */
export function discountPct(askingCents: number, expectedCents: number): number | null {
  if (!askingCents || !expectedCents) return null;
  return Math.round(((expectedCents - askingCents) / expectedCents) * 100);
}

/** Actie-label in de dealtabel (zoals in het ontwerp: Top deal / Onder marktprijs / Snel reageren). */
export function dealBadge(i: BadgeInput): DealBadgeInfo {
  const d = discountPct(i.askingCents, i.expectedCents);
  if (i.blocked) return { label: "Geblokkeerd", tone: "neutral", icon: "flame" };
  if (i.score >= i.topScore) return { label: "Top deal", tone: "success", icon: "thumb" };
  if (i.ageMinutes <= 30 && i.netProfitCents > 0 && (d ?? 0) > 0) return { label: "Snel reageren", tone: "warning", icon: "flame" };
  if ((d ?? 0) >= 15) return { label: "Onder marktprijs", tone: "info", icon: "flame" };
  return { label: "Beoordelen", tone: "neutral", icon: "flame" };
}
