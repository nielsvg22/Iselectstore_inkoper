import type { RulesConfig } from "./config";
import { IPHONE_RELEASE } from "./tables";

/** iPhone-generatie uit de modelsleutel ("iphone-15-pro" → 15). SE/Air/e-modellen hebben geen generatiecijfer. */
export function iphoneGeneration(modelKey: string): number | null {
  const m = /^iphone-(\d{1,2})(?:-|$)/.exec(modelKey);
  return m ? Number(m[1]) : null;
}

const isProLine = (modelKey: string) => /-pro(-max)?$/.test(modelKey);

/** Is dit een Pro/Pro Max van de nieuwste generatie(s) die al uit zijn? Voor die toestellen: nooit verder dan 50 km. */
export function isNewestPro(modelKey: string, now: Date, cfg: Pick<RulesConfig["distance"], "newestGenerations">): boolean {
  if (!isProLine(modelKey)) return false;
  const gen = iphoneGeneration(modelKey);
  if (gen == null) return false;
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const released = new Set<number>();
  for (const [key, rel] of Object.entries(IPHONE_RELEASE)) {
    const g = iphoneGeneration(key);
    if (g != null && rel <= ym) released.add(g);
  }
  const newest = [...released].sort((a, b) => b - a).slice(0, Math.max(1, cfg.newestGenerations));
  return newest.includes(gen);
}

/** Bij oudere modellen een lagere minimumprijs (hoesjes/accessoires filteren). */
export function minPriceEuro(modelKey: string, family: string, cfg: RulesConfig["minPrice"]): number {
  if (family !== "iphone") return cfg.olderEuro;
  const gen = iphoneGeneration(modelKey);
  if (gen == null) return cfg.newerEuro; // SE (2022), 16e, Air: recente modellen
  return gen >= cfg.newerFromGeneration ? cfg.newerEuro : cfg.olderEuro;
}

/** Valt dit iPhone-model buiten de ondergrens (uitgebracht vóór de gekozen generatie)? Modellen zonder bekende releasedatum worden niet uitgesloten. */
export function belowMinIphone(modelKey: string, family: string, minGeneration: number): boolean {
  if (family !== "iphone" || minGeneration <= 0) return false;
  const cut = IPHONE_RELEASE[`iphone-${minGeneration}`] ?? IPHONE_RELEASE[`iphone-${minGeneration}-pro`];
  const rel = IPHONE_RELEASE[modelKey];
  return !!cut && !!rel && rel < cut;
}
