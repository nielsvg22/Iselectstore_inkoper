import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveConfig, getConfig } from "@/lib/settings/store";
import { ingestAd } from "@/lib/pipeline/ingest";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { routeAd, calculateRoute } from "@/lib/radar/routing";
import { allowsPurchase, coordinateKey, drivingWhere, validDriveSeconds } from "@/lib/radar/driving";
import { deliverNotification } from "@/lib/notify/dispatch";
import { GET as feed } from "@/app/api/notify/feed/route";
import { makeUser, req, resetDb } from "../helpers";

const point = { latitude: 52.255, longitude: 6.16 };
const raw = (id: string, lat = point.latitude) => ({ externalId: id, title: "iPhone 16 Pro 256GB", askingCents: 30000, location: "Deventer", distanceKm: 15, attributes: { locationLatitude: lat, locationLongitude: point.longitude }, imageUrls: [], url: `https://www.marktplaats.nl/v/x/${id}-iphone` });
const routeResponse = (seconds = 1800) => new Response(JSON.stringify({ code: "Ok", routes: [{ duration: seconds, distance: 24000 }], waypoints: [{ distance: 5 }, { distance: 10 }] }));
beforeEach(async () => { await resetDb(); await saveConfig({ radar: { cityOnly: "" }, policies: { distance: { mode: "driving", pickupMaxMinutes: 30 }, seller: { minRating: 5, minReviews: 50, minAgeMonths: 24 } }, notifications: { requireFullAnalysis: false } }); });

describe("30 minuten rijden en gecontroleerde verzending", () => {
  it.each([
    [1800, false, null, null, null, false, true],
    [1801, false, 5, 50, 24, false, false],
    [1801, true, 5, 50, 24, false, true],
    [1801, true, 4.9, 50, 24, false, false],
    [1801, true, 5, 49, 24, false, false],
    [1801, true, 5, 50, 23.9, false, false],
    [1801, true, null, 50, 24, false, false],
    [1801, true, 5, 50, 24, true, false],
    [null, true, 5, 50, 24, false, false],
  ])("beoordeelt rijtijd=%s verzending=%s rating=%s reviews=%s leeftijd=%s risico=%s", async (driveSeconds, shipping, rating, reviews, ageMonths, blocked, allowed) => {
    expect(allowsPurchase({ distanceKm: 1, driveSeconds, shipping, rating, reviews, ageMonths, blocked }, await getConfig())).toBe(allowed);
  });
  it("meldt een lokale kans precies eenmaal na routering, onafhankelijk van volledige analyse", async () => {
    const { user } = await makeUser();
    await prisma.searchProfile.create({ data: { userId: user.id, name: "Radar", sourceKind: "SEARCH", sourceConfig: { fastMode: true }, notifyChannels: [], notifyMinScore: 0, lastSuccessAt: new Date(Date.now() - 60000) } });
    const a = await ingestAd(raw("m1234567890"), { origin: "SEARCH", partial: true });
    await analyzeAd(a.adId, { quick: true });
    expect(await prisma.notification.count()).toBe(0);
    const fetcher = vi.fn(async () => routeResponse()) as unknown as typeof fetch;
    await routeAd(a.adId, fetcher);
    await analyzeAd(a.adId, { quick: true }); await analyzeAd(a.adId, { quick: true });
    expect(await prisma.notification.count({ where: { adId: a.adId, channel: "INAPP", status: "SENT" } })).toBe(1);
    expect((await prisma.advertisement.findMany({ where: drivingWhere(await getConfig()) })).map(a => a.id)).toEqual([a.adId]);
    const b = await ingestAd(raw("m1234567891"), { origin: "SEARCH", partial: true });
    // Dedupe intentionally detects identical offers; route cache test uses independent canonical ad.
    await prisma.advertisement.update({ where: { id: b.adId }, data: { duplicateOfId: null } });
    await routeAd(b.adId, fetcher); expect(fetcher).toHaveBeenCalledTimes(1);
    await ingestAd(raw("m1234567890", 52.5), { origin: "SEARCH", partial: true });
    expect(await prisma.advertisement.findUnique({ where: { id: a.adId } })).toMatchObject({ driveSeconds: null, driveCalculatedAt: null });
  });
  it("houdt mislukte routes onbekend en kan herstellen", async () => {
    const a = await ingestAd(raw("m1234567890"), { origin: "SEARCH", partial: true });
    await expect(routeAd(a.adId, vi.fn(async () => new Response("", { status: 503 })) as typeof fetch)).rejects.toThrow("opnieuw");
    expect(await prisma.advertisement.count({ where: drivingWhere(await getConfig()) })).toBe(0);
    await routeAd(a.adId, vi.fn(async () => routeResponse(1500)) as typeof fetch);
    expect(await prisma.advertisement.count({ where: drivingWhere(await getConfig()) })).toBe(1);
  });
  it("keurt buitengebied uitsluitend goed met alle echte verkopersgegevens", async () => {
    const a = await ingestAd({ ...raw("m1234567890"), shipping: ["shipping"], seller: { rating: 5, reviewCount: 50, accountAgeMonths: 24 } }, { origin: "SEARCH", partial: true });
    await routeAd(a.adId, vi.fn(async () => routeResponse(1801)) as typeof fetch);
    await analyzeAd(a.adId, { quick: true });
    expect(await prisma.advertisement.count({ where: drivingWhere(await getConfig()) })).toBe(1);
    await prisma.advertisement.update({ where: { id: a.adId }, data: { sellerSignals: { rating: 4.9, reviewCount: 50, accountAgeMonths: 24 } } });
    expect(await prisma.advertisement.count({ where: drivingWhere(await getConfig()) })).toBe(0);
  });
  it("blokkeert oude meldingen en popups buiten de actuele selectie zonder historie te verwijderen", async () => {
    const { user, cookie } = await makeUser();
    const a = await ingestAd(raw("m1234567890"), { origin: "SEARCH", partial: true });
    await routeAd(a.adId, vi.fn(async () => routeResponse(1801)) as typeof fetch);
    const n = await prisma.notification.create({ data: { userId: user.id, adId: a.adId, channel: "WEBPUSH", dedupeKey: "old", status: "PENDING" } });
    await prisma.notification.create({ data: { userId: user.id, adId: a.adId, channel: "INAPP", dedupeKey: "popup", status: "SENT" } });
    const push = vi.fn(); await deliverNotification(n.id, undefined, { push }); expect(push).not.toHaveBeenCalled();
    const r = await feed(req("/api/notify/feed?after=2020-01-01T00:00:00Z", { cookie })); expect((await r.json()).items).toEqual([]);
    expect(await prisma.notification.count()).toBe(2);
  });
  it("verwerpt verouderde of verplaatste routegegevens", () => {
    const ad = { driveSeconds: 1000, driveCalculatedAt: new Date(), driveCoordinatesKey: coordinateKey(point), rawPayload: { attributes: { locationLatitude: point.latitude, locationLongitude: point.longitude } } };
    expect(validDriveSeconds(ad)).toBe(1000);
    expect(validDriveSeconds({ ...ad, driveCalculatedAt: new Date(Date.now() - 8 * 86400000) })).toBeNull();
    expect(validDriveSeconds({ ...ad, driveCoordinatesKey: "old" })).toBeNull();
    expect(validDriveSeconds({ ...ad, rawPayload: {} })).toBeNull();
  });
  it("gebruikt eigen routering en verwerpt een ongeldige route of te ver gelegen weg", async () => {
    const f = vi.fn(async (_url: unknown) => routeResponse()); await calculateRoute(point, f as typeof fetch);
    expect(String(f.mock.calls[0][0])).toContain("http://routing:5000/route/v1/driving/5.9699,52.2112;6.16,52.255");
    for (const data of [{ code: "NoRoute" }, { code: "Ok", routes: [{ duration: 5, distance: 5 }], waypoints: [{ distance: 0 }, { distance: 1001 }] }]) {
      await expect(calculateRoute(point, vi.fn(async () => new Response(JSON.stringify(data))) as typeof fetch)).rejects.toThrow("betrouwbare");
    }
  });
});
