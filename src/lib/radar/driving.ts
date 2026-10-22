import type { AppConfig } from "../config/schema";
import type { Prisma } from "@prisma/client";
import { APELDOORN, purchaseStatus } from "./safety";

export const ROUTE_VERSION = "osrm-car-nl-20261022";
export const ROUTE_TTL_MS = 7 * 86400_000;
export interface Coordinates { latitude: number; longitude: number }
export function coordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}
export function coordinatesFromRaw(raw: unknown): Coordinates | null {
  const a = (raw as { attributes?: Record<string, unknown> } | null)?.attributes;
  return coordinates(a?.locationLatitude, a?.locationLongitude);
}
export const coordinateKey = (p: Coordinates) => `${ROUTE_VERSION}:${APELDOORN.latitude},${APELDOORN.longitude}:${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;

export interface DriveEvidence {
  driveSeconds: number | null;
  driveCalculatedAt: Date | string | null;
  driveCoordinatesKey: string | null;
  rawPayload: unknown;
}
export function validDriveSeconds(ad: DriveEvidence, now = Date.now()): number | null {
  const point = coordinatesFromRaw(ad.rawPayload);
  const at = ad.driveCalculatedAt ? new Date(ad.driveCalculatedAt).getTime() : NaN;
  return point && ad.driveCoordinatesKey === coordinateKey(point) && Number.isFinite(at) && at <= now && now - at <= ROUTE_TTL_MS
    && ad.driveSeconds != null && Number.isFinite(ad.driveSeconds) && ad.driveSeconds >= 0 ? ad.driveSeconds : null;
}
export function purchasePolicy(cfg: AppConfig) {
  return { radiusKm: cfg.policies.distance.pickupMaxKm, ...cfg.policies.seller,
    ...(cfg.policies.distance.mode === "driving" ? { maxDriveMinutes: cfg.policies.distance.pickupMaxMinutes } : {}) };
}
export function allowsPurchase(input: Parameters<typeof purchaseStatus>[0], cfg: AppConfig) {
  if (cfg.policies.distance.mode !== "driving") return true;
  const status = purchaseStatus(input, purchasePolicy(cfg));
  return status.key === "local" || status.key === "shipping";
}
/** Strict default feed in driving mode. Unknown duration/reviews never auto-qualify. */
export function drivingWhere(cfg: AppConfig, now = new Date()): Prisma.AdvertisementWhereInput {
  if (cfg.policies.distance.mode !== "driving") return {};
  const threshold = cfg.policies.distance.pickupMaxMinutes * 60;
  return { AND: [
    { driveCalculatedAt: { gte: new Date(now.getTime() - ROUTE_TTL_MS), lte: now }, driveCoordinatesKey: { startsWith: `${ROUTE_VERSION}:` } },
    { OR: [{ risk: null }, { risk: { is: { blocked: false, level: { notIn: ["HIGH", "BLOCKED"] } } } }] },
    { OR: [
      { driveSeconds: { gte: 0, lte: threshold } },
      { AND: [
        { driveSeconds: { gt: threshold }, shippingOptions: { array_contains: ["shipping"] }, risk: { is: { blocked: false, level: { notIn: ["HIGH", "BLOCKED"] } } } },
        { sellerSignals: { path: ["rating"], gte: cfg.policies.seller.minRating, lte: 5 } },
        { sellerSignals: { path: ["reviewCount"], gte: cfg.policies.seller.minReviews } },
        { sellerSignals: { path: ["accountAgeMonths"], gte: cfg.policies.seller.minAgeMonths } },
      ] },
    ] },
  ] };
}
