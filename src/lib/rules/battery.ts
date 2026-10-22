import type { RulesConfig } from "./config";
import { BATTERY_ADJUST_EURO, IPHONE_RELEASE } from "./tables";

/** Bijtelling (+) of aftrek (−) op de maximale prijs voor een batterijpercentage, ten opzichte van 85%. Onder 80% is er geen waarde (nooit kopen). */
export function batteryAdjustEuro(pct: number): number {
  const p = Math.max(80, Math.min(100, pct));
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  const a = BATTERY_ADJUST_EURO[lo];
  const b = BATTERY_ADJUST_EURO[hi];
  if (lo === hi) return a;
  return a + (b - a) * (p - lo);
}

/** Aftrek t.o.v. een toestel met 100% batterij (voor prijzen die voor perfecte staat zijn ingevuld). */
export function batteryDeductionEuro(pct: number): number {
  return Math.round((batteryAdjustEuro(100) - batteryAdjustEuro(pct)) * 100) / 100;
}

/** Leeftijd van het model in maanden (alleen als de releasedatum bekend is). */
export function modelAgeMonths(modelKey: string, now = new Date()): number | null {
  const rel = IPHONE_RELEASE[modelKey];
  if (!rel) return null;
  const [y, m] = rel.split("-").map(Number);
  const months = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
  return Math.max(0, months);
}

/** Aangenomen batterijpercentage: tot 6 maanden 100%, daarna 1% per maand, niet lager dan 82%. */
export function assumedBatteryPct(ageMonths: number, cfg: RulesConfig["battery"]): number {
  if (ageMonths <= cfg.fullUntilMonths) return 100;
  return Math.max(cfg.floorPct, Math.round(100 - (ageMonths - cfg.fullUntilMonths) * cfg.dropPerMonthPct));
}
