import type { RulesConfig } from "./config";

export type ScratchState = "free" | "scratched" | "unknown";
export interface ScratchResult { state: ScratchState; evidence: string | null }

const norm = (s: string) =>
  s.toLowerCase().replace(/[‘’´`]/g, "'").replace(/[^a-z0-9àâäçéèêëîïôöùûüñ%'\s.,;:!?-]/g, " ").replace(/\s+/g, " ");

const NEGATED = /\b(?:geen|zonder|niet|nul|no|nooit)\s+(?:enkele\s+|één\s+|echte\s+|zichtbare\s+|diepe\s+|noemenswaardige\s+|echt\s+)?(?:\w+\s+)?(?:krassen|krasjes|kras|gekrast|schade|schrammen|beschadigingen|gebruikssporen|scratches)\b/g;

/**
 * Bepaalt of een advertentie krasvrij/altijd beschermd is, krassen noemt, of niets zegt.
 * "Krasvrij"-uitdrukkingen (ook "geen krassen") worden eerst weggehaald; blijft er daarna een krasserwoord over, dan wint "met krassen".
 */
export function analyzeScratch(text: string, mpCondition: string | null, cfg: RulesConfig["scratch"]): ScratchResult {
  let t = " " + norm(text) + " ";
  let freeHit: string | null = null;
  for (const m of t.matchAll(NEGATED)) { freeHit ??= m[0].trim(); }
  t = t.replace(NEGATED, " ");
  const phrases = [...cfg.freePhrases].map(norm).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const ph of phrases) {
    const idx = t.indexOf(ph);
    if (idx < 0) continue;
    // "als nieuw" mag geen deel zijn van een woord
    const before = t[idx - 1] ?? " ";
    if (/[a-z0-9]/.test(before)) continue;
    freeHit ??= ph;
    t = t.split(ph).join(" ");
  }
  let scratchHit: string | null = null;
  for (const root of cfg.scratchPhrases.map(norm)) {
    const m = new RegExp(`(?:^|[^a-z0-9])(${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]*)`).exec(t);
    if (m) { scratchHit = m[1]; break; }
  }
  if (scratchHit) return { state: "scratched", evidence: scratchHit };
  if (freeHit) return { state: "free", evidence: freeHit };
  const cond = (mpCondition ?? "").toLowerCase();
  if (cfg.newCountsAsFree && /(^|\b)(nieuw|new|ongebruikt|sealed)\b/.test(cond) && !/gebruikt/.test(cond)) return { state: "free", evidence: `conditie: ${mpCondition}` };
  return { state: "unknown", evidence: null };
}
