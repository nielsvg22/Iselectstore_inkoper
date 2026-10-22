import type { AppConfig } from "@/lib/config/schema";

export type DistanceMode = "near" | "far_shipping" | "far_pickup_only" | "unknown";

export interface DistanceCosts {
  mode: DistanceMode;
  transportCents: number | null;
  shippingCents: number | null;
  note: string;
}

/** Bepaalt ophaal-/verzendscenario en de bijbehorende extra kosten (alleen als die in het beleid zijn ingesteld). */
export function distanceCosts(distanceKm: number | null, shipping: string[], cfg: AppConfig, driveSeconds: number | null = null, driveMeters: number | null = null): DistanceCosts {
  const p = cfg.policies.distance;
  const canShip = shipping.includes("shipping");
  if (p.mode === "driving") {
    if (driveSeconds == null) return { mode: "unknown", transportCents: null, shippingCents: null, note: "Rijtijd onbekend: route nog niet berekend." };
    const near = driveSeconds <= p.pickupMaxMinutes * 60;
    const transport = driveMeters != null && p.transportPerKmCents > 0 ? Math.round(driveMeters / 1000 * 2 * p.transportPerKmCents) : null;
    return { mode: near ? "near" : canShip ? "far_shipping" : "far_pickup_only",
      transportCents: near || !canShip ? transport : null,
      shippingCents: !near && canShip && p.shippingCostCents > 0 ? p.shippingCostCents : null,
      note: `Geschatte autorijtijd ${Math.ceil(driveSeconds / 60)} minuten vanaf Apeldoorn, zonder actuele verkeersinformatie. Verkoperscontrole blijft afzonderlijk verplicht.` };
  }
  if (distanceKm == null) return { mode: "unknown", transportCents: null, shippingCents: null, note: "Afstand onbekend: geen automatische transport-/verzendkosten toegepast." };
  if (distanceKm <= p.pickupMaxKm) {
    const t = p.transportPerKmCents > 0 ? Math.round(distanceKm * 2 * p.transportPerKmCents) : null;
    return { mode: "near", transportCents: t, shippingCents: null, note: `Binnen ${p.pickupMaxKm} km: ophalen${t ? ` (reiskosten ${(t / 100).toFixed(2)} meegenomen)` : ""}.` };
  }
  if (canShip) {
    return { mode: "far_shipping", transportCents: null, shippingCents: p.shippingCostCents > 0 ? p.shippingCostCents : null, note: `Verder dan ${p.pickupMaxKm} km, verzending mogelijk${p.shippingCostCents > 0 ? ` (verzendkosten ${(p.shippingCostCents / 100).toFixed(2)} meegenomen)` : ""}.` };
  }
  const t = p.transportPerKmCents > 0 ? Math.round(distanceKm * 2 * p.transportPerKmCents) : null;
  return { mode: "far_pickup_only", transportCents: t, shippingCents: null, note: `Verder dan ${p.pickupMaxKm} km en geen verzending vermeld${t ? ` (reiskosten ${(t / 100).toFixed(2)} meegenomen)` : ""}.` };
}

const BATTERY_FAMILIES = new Set(["iphone", "ipad", "macbook", "macbook_air", "macbook_pro", "watch"]);

export interface BatteryOutcome {
  relevant: boolean;
  known: boolean;
  /** extra reparatiekosten (batterijvervanging) */
  replacementCents: number;
  /** vermenigvuldiger op verwachte verkoopprijs (1 = geen correctie) */
  priceFactor: number;
  exclude: boolean;
  review: boolean;
  notes: string[];
}

export function batteryOutcome(family: string, battery: number | null, cfg: AppConfig): BatteryOutcome {
  const p = cfg.policies.battery;
  const out: BatteryOutcome = { relevant: BATTERY_FAMILIES.has(family), known: battery != null, replacementCents: 0, priceFactor: 1, exclude: false, review: false, notes: [] };
  if (!out.relevant) return out;
  if (battery == null) {
    if (p.unknown === "exclude") { out.exclude = true; out.notes.push("Batterijconditie onbekend en beleid sluit onbekend uit"); }
    else if (p.unknown === "review") { out.review = true; out.notes.push("Batterijconditie onbekend: apart beoordelen"); }
    return out;
  }
  if (p.excludeBelowPct > 0 && battery < p.excludeBelowPct) { out.exclude = true; out.notes.push(`Batterijconditie ${battery}% is lager dan de uitsluitgrens ${p.excludeBelowPct}%`); }
  if (p.replaceBelowPct > 0 && battery < p.replaceBelowPct) {
    if (p.deductReplacement && p.replacementCents > 0) { out.replacementCents = p.replacementCents; out.notes.push(`Batterijvervanging (${(p.replacementCents / 100).toFixed(2)}) in de kosten opgenomen`); }
    if (p.priceCorrectionPct > 0) { out.priceFactor = 1 - p.priceCorrectionPct / 100; out.notes.push(`Verwachte verkoopprijs ${p.priceCorrectionPct}% lager vanwege batterijconditie`); }
  }
  return out;
}
