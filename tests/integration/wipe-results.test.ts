import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { applyWipeResults, parseWipeToken } from "@/lib/maintenance/wipe-results";
import { makeUser, resetDb } from "../helpers";

let n = 0;
async function seedAd(userId: string, profileId: string) {
  n++;
  const a = await prisma.advertisement.create({ data: { source: "marktplaats", origin: "SEARCH", externalId: `w-${n}`, url: `https://x.nl/${n}`, title: `iPhone ${n}`, description: "", askingPriceCents: 50000, fingerprint: `fp-w-${n}`, status: "ANALYZED" } });
  await prisma.advertisementImage.create({ data: { adId: a.id, url: "https://i.example/1.jpg", position: 0 } });
  await prisma.dealAnalysis.create({ data: { adId: a.id, askingCents: 50000, lowCents: 0, expectedCents: 60000, highCents: 0, valuationConfidence: 0.8, sampleSize: 5, costs: {}, netProfitCents: 10000, conservativeProfitCents: 0, optimisticProfitCents: 0, grossMarginPct: 0, netMarginPct: 0, roiPct: 20, minSalePriceCents: 0, maxBidCents: 0, score: 70, band: "INTERESTING", scoreBreakdown: {}, explanation: "", settingsSnapshot: {} } });
  await prisma.profileMatch.create({ data: { profileId, adId: a.id, matched: true } });
  await prisma.notification.create({ data: { adId: a.id, profileId, userId, channel: "WEBPUSH", status: "SENT", dedupeKey: `wipe-${n}` } });
  return a;
}

describe("gevonden resultaten wissen (WIPE_RESULTS)", () => {
  let userId: string; let profileId: string;
  beforeEach(async () => {
    await resetDb();
    userId = (await makeUser()).user.id;
    profileId = (await prisma.searchProfile.create({ data: { userId, name: "Smart Inkoopradar", active: true, query: "", sourceKind: "SEARCH", sourceConfig: { queries: ["iphone"], baselineAt: "2026-11-01T00:00:00.000Z" }, intervalMinutes: 5, notifyChannels: [], lastSuccessAt: new Date(), discoveredCount: 9 } })).id;
  });

  it("leest alleen een geldig label", () => {
    expect(parseWipeToken(undefined)).toBeNull();
    expect(parseWipeToken("  ")).toBeNull();
    expect(parseWipeToken("2026-11-16-a")).toBe("2026-11-16-a");
    expect(parseWipeToken("a b")).toBeNull();
    expect(parseWipeToken("x;drop")).toBeNull();
  });

  it("niet ingesteld of ongeldig: er gebeurt niets", async () => {
    await seedAd(userId, profileId);
    expect(await applyWipeResults(undefined)).toMatchObject({ applied: false, reason: "niet ingesteld" });
    expect(await applyWipeResults("a b")).toMatchObject({ applied: false, reason: "ongeldig label genegeerd" });
    expect(await prisma.advertisement.count()).toBe(1);
  });

  it("wist advertenties met alles eraan en zet de nulmeting terug, en laat de rest staan", async () => {
    const a = await seedAd(userId, profileId); await seedAd(userId, profileId);
    const purchase = await prisma.purchase.create({ data: { userId, adId: a.id, title: "Gekochte iPhone", mNumber: "m123" } });
    await prisma.backgroundJob.create({ data: { type: "ANALYZE_AD", payload: { adId: a.id }, uniqueKey: `analyze:${a.id}` } });
    await prisma.backgroundJob.create({ data: { type: "CHECK_PROFILE", payload: { profileId }, uniqueKey: `check:${profileId}` } });
    await prisma.appSettings.create({ data: { key: `slice:state:${profileId}`, value: { x: 1 } } });
    await prisma.appSettings.create({ data: { key: `slice:full:${profileId}`, value: { at: "x" } } });
    await prisma.appSettings.create({ data: { key: "rules:bbp", value: { marginTable: "A" } } });

    const r = await applyWipeResults("2026-11-16-a");
    expect(r).toMatchObject({ applied: true, deletedAds: 2, resetProfiles: 1 });

    for (const count of [prisma.advertisement.count(), prisma.advertisementImage.count(), prisma.dealAnalysis.count(), prisma.profileMatch.count(), prisma.notification.count()]) expect(await count).toBe(0);
    // inkoop blijft, alleen de koppeling vervalt
    expect(await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).toMatchObject({ title: "Gekochte iPhone", mNumber: "m123", adId: null });
    // wachtende taken voor advertenties weg, de zoektaak blijft
    expect((await prisma.backgroundJob.findMany({ select: { type: true } })).map((j) => j.type)).toEqual(["CHECK_PROFILE"]);
    // zoekvoortgang en nulmeting terug, profiel en instellingen blijven
    const p = await prisma.searchProfile.findUniqueOrThrow({ where: { id: profileId } });
    expect(p.sourceConfig).toEqual({ queries: ["iphone"] });
    expect(p).toMatchObject({ active: true, lastSuccessAt: null, discoveredCount: 0 });
    expect(await prisma.appSettings.findUnique({ where: { key: `slice:state:${profileId}` } })).toBeNull();
    expect(await prisma.appSettings.findUnique({ where: { key: `slice:full:${profileId}` } })).toBeNull();
    expect(await prisma.appSettings.findUnique({ where: { key: "rules:bbp" } })).not.toBeNull();
    expect(await prisma.user.count()).toBe(1);
  });

  it("één keer per label: nieuwe resultaten blijven staan, een nieuw label wist opnieuw", async () => {
    await seedAd(userId, profileId);
    await applyWipeResults("a1");
    await seedAd(userId, profileId);
    expect(await applyWipeResults("a1")).toMatchObject({ applied: false, reason: "al uitgevoerd" });
    expect(await prisma.advertisement.count()).toBe(1);
    expect(await applyWipeResults("a2")).toMatchObject({ applied: true, deletedAds: 1 });
    expect(await prisma.advertisement.count()).toBe(0);
  });

  it("zonder advertenties of nulmeting is het ook goed (leeg wissen)", async () => {
    expect(await applyWipeResults("leeg")).toMatchObject({ applied: true, deletedAds: 0, resetProfiles: 1 });
  });
});
