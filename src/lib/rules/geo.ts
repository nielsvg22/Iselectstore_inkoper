import type { RulesConfig } from "./config";

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) * 10) / 10;
}

export interface CenterHit { name: string; km: number; flag: boolean; hot: boolean; bonusEuro: number }

/** Afstand tot elk ingesteld centrum (hemelsbreed) en de bijbehorende markering/bijtelling. Zonder coördinaten: geen treffers. */
export function centerHits(lat: number | null, lon: number | null, cfg: RulesConfig["distance"]): CenterHit[] {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return cfg.centers.map((c) => {
    const km = haversineKm(c.latitude, c.longitude, lat, lon);
    return { name: c.name, km, flag: km <= c.flagKm, hot: km <= c.hotKm, bonusEuro: km <= c.bonusKm ? c.bonusEuro : 0 };
  });
}
