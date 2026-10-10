import type { AppConfig } from "@/lib/config/schema";
import type { Comparable } from "@/lib/types";

export interface ValuationTarget {
  modelKey: string;
  storageGb?: number | null;
  ramGb?: number | null;
  batteryHealth?: number | null;
  conditionGrade?: "A" | "B" | "C" | null;
  /** Reparatie bekend => verkoopwaarde wordt verlaagd met 'gerepareerd'-korting */
  willBeRepaired?: boolean;
  /** Dit exacte item uitsluiten van de set (zelf-referentie voorkomen) */
  excludeSourceAdId?: string;
}

export interface ValuationResult {
  lowCents: number;
  expectedCents: number;
  highCents: number;
  confidence: number; // 0..1
  sampleSize: number;
  realizedUsed: number;
  uncertain: boolean;
  steps: string[];
  tier: "exact" | "extended" | "none";
}

export interface ValuationComparableInput extends Comparable {
  modelKey: string;
  sourceAdId?: string | null;
}

function weightedQuantile(values: Array<{ v: number; w: number }>, q: number): number {
  const s = [...values].sort((a, b) => a.v - b.v);
  const total = s.reduce((a, x) => a + x.w, 0);
  if (!total) return 0;
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc / total >= q) return x.v;
  }
  return s[s.length - 1].v;
}

export const median = (arr: number[]): number => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function removeOutliers<T extends { v: number }>(items: T[]): { kept: T[]; removed: number } {
  if (items.length < 5) return { kept: items, removed: 0 };
  const vals = items.map((i) => i.v).sort((a, b) => a - b);
  const q1 = vals[Math.floor((vals.length - 1) * 0.25)];
  const q3 = vals[Math.floor((vals.length - 1) * 0.75)];
  const med = vals[Math.floor((vals.length - 1) / 2)];
  // Minimale marge (15% van de mediaan) voorkomt dat een zeer smalle spreiding normale prijzen als uitschieter aanmerkt
  const fence = Math.max(1.5 * (q3 - q1), 0.15 * med);
  const lo = q1 - fence;
  const hi = q3 + fence;
  const kept = items.filter((i) => i.v >= lo && i.v <= hi);
  return { kept, removed: items.length - kept.length };
}

export function valuate(target: ValuationTarget, comps: ValuationComparableInput[], cfg: AppConfig, now = new Date()): ValuationResult {
  const vc = cfg.valuation;
  const steps: string[] = [];
  const maxAgeMs = vc.maxAgeDays * 86400000;

  const pool = comps.filter(
    (c) =>
      c.modelKey === target.modelKey &&
      c.priceCents > 0 &&
      (!target.excludeSourceAdId || c.sourceAdId !== target.excludeSourceAdId) &&
      now.getTime() - c.observedAt.getTime() <= maxAgeMs * (c.kind === "REALIZED" ? 2 : 1),
  );

  const sameStorage = (c: ValuationComparableInput) => target.storageGb == null || c.storageGb == null || c.storageGb === target.storageGb;
  const sameRam = (c: ValuationComparableInput) => target.ramGb == null || c.ramGb == null || c.ramGb === target.ramGb;
  const exactPool = pool.filter((c) => sameStorage(c) && sameRam(c) && (target.storageGb == null || c.storageGb != null));
  let tier: ValuationResult["tier"] = "exact";
  let working = exactPool.map((c) => ({ c, adj: 1 }));

  if (exactPool.length < vc.minComparables && target.storageGb != null) {
    // uitbreiden met andere opslagvarianten, geschaald via (instelbare) staptoeslag per verdubbeling
    const step = vc.storageStepPct / 100;
    const extra = pool
      .filter((c) => c.storageGb != null && c.storageGb !== target.storageGb && sameRam(c))
      .map((c) => {
        const doublings = Math.log2(target.storageGb! / c.storageGb!);
        return { c, adj: Math.max(0.5, Math.min(2, Math.pow(1 + step, doublings))) };
      });
    if (extra.length) {
      working = [...working, ...extra];
      tier = "extended";
      steps.push(`Te weinig exacte vergelijkingen (${exactPool.length}); ${extra.length} andere opslagvarianten meegenomen met ${vc.storageStepPct}% per opslagverdubbeling (aanname).`);
    }
  }

  if (!working.length) {
    return { lowCents: 0, expectedCents: 0, highCents: 0, confidence: 0, sampleSize: 0, realizedUsed: 0, uncertain: true, steps: ["Geen vergelijkbare marktdata beschikbaar voor dit model."], tier: "none" };
  }

  // Omrekenen naar verwachte gerealiseerde verkoopprijs + gewicht
  const items = working.map(({ c, adj }) => {
    const ageDays = (now.getTime() - c.observedAt.getTime()) / 86400000;
    const recency = Math.max(0.3, 1 - ageDays / (vc.maxAgeDays * 2));
    let v = c.priceCents * adj;
    let w = 1;
    if (c.kind === "REALIZED") {
      w = 2.0 * recency;
    } else if (c.kind === "ASKING_CURRENT") {
      v *= vc.askToRealizedFactor;
      w = 1.0 * recency;
    } else {
      v *= vc.askToRealizedFactor;
      w = 0.6 * recency;
    }
    if (tier === "extended" && adj !== 1) w *= 0.6;
    return { v, w, kind: c.kind, battery: c.batteryHealth ?? null };
  });
  steps.push(
    `${items.length} vergelijkingen (${items.filter((i) => i.kind === "REALIZED").length} gerealiseerd, ${items.filter((i) => i.kind === "ASKING_CURRENT").length} actuele vraagprijs, ${items.filter((i) => i.kind === "ASKING_HISTORIC").length} historische vraagprijs). Vraagprijzen zijn omgerekend met factor ${vc.askToRealizedFactor}.`,
  );

  const { kept, removed } = removeOutliers(items);
  if (removed) steps.push(`${removed} uitschieter(s) verwijderd (IQR-methode).`);

  const base = weightedQuantile(kept, 0.5);
  let p25 = weightedQuantile(kept, 0.25);
  let p75 = weightedQuantile(kept, 0.75);
  steps.push(`Gewogen mediaan: ${Math.round(base / 100)} euro (P25 ${Math.round(p25 / 100)}, P75 ${Math.round(p75 / 100)}).`);

  // Aanpassingen
  let factor = 1;
  const compBat = kept.map((k) => k.battery).filter((b): b is number => b != null);
  const refBat = compBat.length >= 3 ? median(compBat) : vc.batteryPenaltyBelow + 5;
  if (target.batteryHealth != null && target.batteryHealth < vc.batteryPenaltyBelow) {
    const pts = Math.min(30, Math.max(0, Math.min(refBat, vc.batteryPenaltyBelow) - target.batteryHealth));
    const pen = Math.min(0.15, (pts * vc.batteryPenaltyPctPerPoint) / 100);
    if (pen > 0) {
      factor *= 1 - pen;
      steps.push(`Batterij ${target.batteryHealth}% (< ${vc.batteryPenaltyBelow}%): -${(pen * 100).toFixed(1)}%.`);
    }
  }
  const cm = vc.conditionMultipliers;
  const condMul = target.conditionGrade ? cm[target.conditionGrade] : cm.unknown;
  if (condMul !== 1) {
    factor *= condMul;
    steps.push(`Conditie ${target.conditionGrade ?? "onbekend"}: x${condMul}.`);
  }
  if (target.willBeRepaired) {
    const d = vc.repairedDiscountPct / 100;
    factor *= 1 - d;
    steps.push(`Gerepareerd toestel: -${vc.repairedDiscountPct}% op verkoopprijs. Reparatiekosten staan apart in de winstberekening.`);
  }

  let expected = base * factor;
  p25 *= factor;
  p75 *= factor;

  // Spreiding rond verwachting
  const cv = base ? Math.max(0, (p75 - p25) / 2 / base) : 1;
  let low = Math.min(p25, expected * 0.92);
  let high = Math.max(p75, expected * 1.06);

  // Betrouwbaarheid
  const n = kept.length;
  const realized = kept.filter((k) => k.kind === "REALIZED").length;
  const sizeScore = Math.min(1, n / (vc.minComparables * 2));
  const realizedShare = n ? realized / n : 0;
  const dispersion = 1 - Math.min(1, cv * 2.5);
  const recencyScore = kept.reduce((a, k) => a + k.w, 0) / (n || 1) / 1.5;
  let confidence = sizeScore * 0.5 + realizedShare * 0.2 + dispersion * 0.2 + Math.min(1, recencyScore) * 0.1;
  if (tier === "extended") confidence *= 0.8;
  if (n < vc.minComparables) confidence = Math.min(confidence, 0.35);
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
  const uncertain = n < vc.minComparables || confidence < 0.4;
  if (uncertain) steps.push(`Waardering is onzeker: ${n} vergelijking(en), betrouwbaarheid ${Math.round(confidence * 100)}%.`);

  low = Math.max(0, Math.round(low));
  expected = Math.max(low, Math.round(expected));
  high = Math.max(expected, Math.round(high));
  return { lowCents: low, expectedCents: expected, highCents: high, confidence, sampleSize: n, realizedUsed: realized, uncertain, steps, tier };
}
