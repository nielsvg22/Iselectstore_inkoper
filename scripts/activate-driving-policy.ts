/** Run once after migration and router readiness. Preserves all source/history records. */
import "../src/worker/env";
import { prisma } from "../src/lib/db/client";
import { configSchema } from "../src/lib/config/schema";
import { calculateRoute } from "../src/lib/radar/routing";
import { coordinateKey, coordinatesFromRaw, validDriveSeconds } from "../src/lib/radar/driving";

async function main() {
  const proof = await calculateRoute({ latitude: 52.255, longitude: 6.16 });
  if (proof.seconds <= 0 || proof.seconds > 1800) throw new Error("Router readiness check failed; existing selection retained");
  // Also proves the additive migration has finished before changing the live policy.
  await prisma.advertisement.findFirst({ select: { driveSeconds: true } });
  const backupKey = "backup:driving-policy:20261022";
  const counts = await prisma.$transaction(async tx => {
    const row = await tx.appSettings.findUnique({ where: { key: "config" } });
    const previous = configSchema.parse(row?.value ?? {});
    await tx.appSettings.upsert({ where: { key: backupKey }, update: {}, create: { key: backupKey, value: JSON.parse(JSON.stringify({
      at: new Date().toISOString(), config: row?.value ?? {}, profiles: await tx.searchProfile.findMany({ include: { rules: true } }),
    })) } });
    const next = configSchema.parse({ ...previous, radar: { ...previous.radar, cityOnly: "" }, policies: {
      ...previous.policies, distance: { ...previous.policies.distance, mode: "driving", pickupMaxMinutes: 30 },
      seller: { ...previous.policies.seller, minRating: 5, minReviews: 50, minAgeMonths: 24 },
    } });
    await tx.appSettings.upsert({ where: { key: "config" }, update: { value: next }, create: { key: "config", value: next } });
    await tx.appSettings.upsert({ where: { key: "routing:health" }, update: { value: { ok: true, lastSuccessAt: proof.checkedAt } }, create: { key: "routing:health", value: { ok: true, lastSuccessAt: proof.checkedAt } } });
    return { ads: await tx.advertisement.count(), purchases: await tx.purchase.count(), profiles: await tx.searchProfile.count(), rules: await tx.searchRule.count() };
  }, { timeout: 30000 });
  // Only a small recent set. Normal ingestion supplies routes for each new offer afterwards.
  const recent = await prisma.advertisement.findMany({ where: { isDemo: false, duplicateOfId: null, firstSeenAt: { gte: new Date(Date.now() - 15 * 60000) } }, orderBy: { firstSeenAt: "desc" }, take: 200 });
  let queued = 0;
  for (const ad of recent) {
    const point = coordinatesFromRaw(ad.rawPayload);
    if (!point || validDriveSeconds(ad) != null) continue;
    const uniqueKey = `route:${ad.id}:activation:${coordinateKey(point)}`;
    const result = await prisma.backgroundJob.upsert({ where: { uniqueKey }, update: {}, create: { type: "ROUTE_AD", payload: { adId: ad.id }, priority: 10, uniqueKey } });
    if (result.status === "PENDING") queued++;
  }
  console.log("TRAVEL_RELEASE " + JSON.stringify({ ...counts, backupKey, localMinutes: 30, minRating: 5, minReviews: 50, minAccountMonths: 24, cityOnly: "", routerProofSeconds: proof.seconds, recentRouteJobs: queued }));
}
main().catch(() => { console.error("Driving policy activation failed; inspect router and migration before retrying"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
