import type { Fact, Recognition } from "@/lib/types";
import { recognizeByRules, type RecognitionInput } from "./rules";

export { recognizeByRules } from "./rules";
export type { RecognitionInput } from "./rules";
export { normalizeText } from "./normalize";

export interface ManualOverrides {
  modelKey?: string;
  modelLabel?: string;
  family?: Recognition["family"];
  facts?: Record<string, string | number | boolean>;
}

/** Handmatige correcties winnen altijd en worden als CONFIRMED gemarkeerd. */
export function applyOverrides(rec: Recognition, ov: ManualOverrides | null | undefined): Recognition {
  if (!ov) return rec;
  const out: Recognition = { ...rec, facts: { ...rec.facts }, unknown: [...rec.unknown] };
  if (ov.family) out.family = ov.family;
  if (ov.modelKey) {
    out.modelKey = ov.modelKey;
    out.modelLabel = ov.modelLabel ?? ov.modelKey;
    out.confidence = 1;
  }
  for (const [k, v] of Object.entries(ov.facts ?? {})) {
    if (v === "" || v == null) continue;
    const f: Fact = { value: v, source: "CONFIRMED", evidence: "handmatig ingevoerd" };
    out.facts[k] = f;
    out.unknown = out.unknown.filter((u) => u !== k);
  }
  return out;
}

export function recognize(input: RecognitionInput, overrides?: ManualOverrides | null): Recognition {
  return applyOverrides(recognizeByRules(input), overrides);
}

/** Voeg AI-feiten toe zonder bestaande (regel-/bevestigde) feiten te overschrijven. */
export function mergeAiFacts(rec: Recognition, ai: { facts: Record<string, string | number | boolean>; modelKey?: string; modelLabel?: string; family?: Recognition["family"]; confidence: number }): Recognition {
  const out: Recognition = { ...rec, facts: { ...rec.facts }, unknown: [...rec.unknown], recognizedBy: "rules+ai" };
  if (rec.family === "unknown" && ai.family && ai.modelKey) {
    out.family = ai.family;
    out.modelKey = ai.modelKey;
    out.modelLabel = ai.modelLabel ?? ai.modelKey;
    out.recognizedBy = "ai";
    out.confidence = Math.min(0.7, ai.confidence);
  }
  for (const [k, v] of Object.entries(ai.facts)) {
    if (out.facts[k]) continue;
    out.facts[k] = { value: v, source: "AI_ESTIMATE", evidence: "AI-inschatting" };
    out.unknown = out.unknown.filter((u) => u !== k);
  }
  return out;
}
