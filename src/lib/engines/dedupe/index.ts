import { createHash } from "node:crypto";
import { tokenize } from "../recognition/normalize";

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Bestandsnaam zonder host/params, voor foto-vergelijking. */
export function imageKey(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? url;
    return last.replace(/\.(jpe?g|png|webp)$/i, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function fingerprint(title: string, modelKey: string, storageGb: number | null): string {
  const toks = [...new Set(tokenize(title))].sort().join(" ");
  return createHash("sha1").update(`${modelKey}|${storageGb ?? ""}|${toks}`).digest("hex").slice(0, 24);
}

export function contentHash(parts: { title: string; description: string; askingCents: number | null; imageUrls: string[] }): string {
  return createHash("sha1")
    .update(JSON.stringify([parts.title, parts.description, parts.askingCents, parts.imageUrls]))
    .digest("hex")
    .slice(0, 24);
}

export interface DupCandidate {
  id: string;
  title: string;
  askingCents: number | null;
  location: string | null;
  imageUrls: string[];
  modelKey?: string | null;
  storageGb?: number | null;
}

export interface DupResult {
  duplicateOfId: string;
  score: number;
  reasons: string[];
}

/**
 * Detecteert dezelfde advertentie onder een andere id (opnieuw geplaatst).
 * Combineert titelgelijkenis, gedeelde foto's, prijs en locatie.
 */
export function findDuplicate(c: DupCandidate, existing: DupCandidate[]): DupResult | null {
  const ct = tokenize(c.title);
  const ci = new Set(c.imageUrls.map(imageKey));
  let best: DupResult | null = null;
  for (const e of existing) {
    if (e.id === c.id) continue;
    const titleSim = jaccard(ct, tokenize(e.title));
    const shared = e.imageUrls.map(imageKey).filter((k) => ci.has(k)).length;
    const imgSim = ci.size && e.imageUrls.length ? shared / Math.min(ci.size, e.imageUrls.length) : 0;
    const sameLoc = !!c.location && !!e.location && c.location.toLowerCase() === e.location.toLowerCase();
    const priceClose = c.askingCents != null && e.askingCents != null && Math.abs(c.askingCents - e.askingCents) <= Math.max(1000, 0.05 * e.askingCents);
    const sameProduct = !!c.modelKey && c.modelKey === e.modelKey && (c.storageGb ?? null) === (e.storageGb ?? null);
    let score = 0.45 * titleSim + 0.35 * imgSim + 0.1 * (sameLoc ? 1 : 0) + 0.1 * (priceClose ? 1 : 0);
    const reasons: string[] = [];
    if (titleSim >= 0.7) reasons.push(`titel ${Math.round(titleSim * 100)}% gelijk`);
    if (imgSim > 0) reasons.push(`${shared} gedeelde foto('s)`);
    if (sameLoc) reasons.push("zelfde plaats");
    if (priceClose) reasons.push("vergelijkbare prijs");
    // Identieke foto's + zelfde product + zelfde plaats is vrijwel zeker dezelfde aanbieder
    if (imgSim >= 0.5 && sameLoc && (sameProduct || titleSim >= 0.5)) score = Math.max(score, 0.9);
    if (score >= 0.78 && (!best || score > best.score)) best = { duplicateOfId: e.id, score: Math.round(score * 100) / 100, reasons };
  }
  return best;
}
