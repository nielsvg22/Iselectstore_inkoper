import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { APELDOORN } from "./safety";
import { coordinateKey, coordinatesFromRaw, ROUTE_TTL_MS, validDriveSeconds, type Coordinates } from "./driving";

export interface RouteResult { seconds: number; meters: number; checkedAt: string }
/** Own OSRM only. Public demo services are not a commercial production dependency. */
export async function calculateRoute(point: Coordinates, fetchImpl = fetch): Promise<RouteResult> {
  const base = new URL(process.env.ROUTING_URL || "http://routing:5000");
  if (base.protocol !== "http:" || !["routing", "localhost", "127.0.0.1"].includes(base.hostname) || base.username || base.password)
    throw new Error("Ongeldige interne routeringsconfiguratie");
  const url = new URL(`/route/v1/driving/${APELDOORN.longitude},${APELDOORN.latitude};${point.longitude},${point.latitude}`, base);
  url.search = "overview=false&steps=false&alternatives=false&radiuses=1000;1000";
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(4000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error(`Routering HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 64000) throw new Error("Routeringsantwoord te groot");
  const data = JSON.parse(body) as { code?: string; routes?: Array<{ duration?: number; distance?: number }>; waypoints?: Array<{ distance?: number }> };
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route || data.waypoints?.length !== 2 || data.waypoints.some(w => typeof w.distance !== "number" || !Number.isFinite(w.distance) || w.distance > 1000 || w.distance < 0)
    || typeof route.duration !== "number" || !Number.isFinite(route.duration) || route.duration < 0
    || typeof route.distance !== "number" || !Number.isFinite(route.distance) || route.distance < 0)
    throw new Error("Geen betrouwbare autoroute beschikbaar");
  return { seconds: route.duration, meters: route.distance, checkedAt: new Date().toISOString() };
}

export async function routeAd(adId: string, fetchImpl = fetch) {
  const ad = await prisma.advertisement.findUnique({ where: { id: adId } });
  if (!ad || ad.duplicateOfId || validDriveSeconds(ad) != null) return;
  const point = coordinatesFromRaw(ad.rawPayload);
  if (!point) return;
  const key = coordinateKey(point);
  try {
    await prisma.$transaction(async tx => {
      // Co-located ads share one route; the network call never holds the ingestion lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const cached = (await tx.appSettings.findUnique({ where: { key: `route:${key}` } }))?.value as unknown as RouteResult | undefined;
      const at = cached ? Date.parse(cached.checkedAt) : NaN;
      const route = cached && Number.isFinite(at) && at <= Date.now() && Date.now() - at < ROUTE_TTL_MS ? cached : await calculateRoute(point, fetchImpl);
      if (route !== cached) await tx.appSettings.upsert({ where: { key: `route:${key}` }, update: { value: route as unknown as Prisma.InputJsonValue }, create: { key: `route:${key}`, value: route as unknown as Prisma.InputJsonValue } });
      // Serialise the update with ingestion so moved advertisements cannot inherit an old route.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ingest:${ad.source}:${ad.externalId}`}))`;
      const current = await tx.advertisement.findUnique({ where: { id: adId }, select: { rawPayload: true } });
      const currentPoint = coordinatesFromRaw(current?.rawPayload);
      if (!currentPoint || coordinateKey(currentPoint) !== key) return;
      await tx.advertisement.update({ where: { id: adId }, data: { driveSeconds: route.seconds, driveMeters: route.meters, driveCalculatedAt: new Date(route.checkedAt), driveCoordinatesKey: key, driveError: null } });
      const uniqueKey = `analyze:${adId}:route:${key}:${route.checkedAt}`;
      await tx.backgroundJob.upsert({ where: { uniqueKey }, update: {}, create: { type: "ANALYZE_AD", payload: { adId, quick: true }, priority: 25, uniqueKey } });
      await tx.appSettings.upsert({ where: { key: "routing:health" }, update: { value: { ok: true, lastSuccessAt: new Date().toISOString() } }, create: { key: "routing:health", value: { ok: true, lastSuccessAt: new Date().toISOString() } } });
    }, { timeout: 15000, maxWait: 15000 });
  } catch {
    await prisma.advertisement.updateMany({ where: { id: adId }, data: { driveError: "Rijtijd tijdelijk niet beschikbaar; geen automatische goedkeuring" } });
    await prisma.appSettings.upsert({ where: { key: "routing:health" }, update: { value: { ok: false, lastFailureAt: new Date().toISOString() } }, create: { key: "routing:health", value: { ok: false, lastFailureAt: new Date().toISOString() } } });
    throw new Error("Eigen routeringsdienst niet beschikbaar; route wordt opnieuw geprobeerd");
  }
}
