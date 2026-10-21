import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveConfig } from "@/lib/settings/store";
import { runProfileCheck } from "@/lib/jobs/handlers";
import { searchAdapter } from "@/lib/sources/marktplaats-search";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { deliverNotification } from "@/lib/notify/dispatch";
import { ingestAd } from "@/lib/pipeline/ingest";
import { GET as feed } from "@/app/api/notify/feed/route";
import { makeUser, req, resetDb } from "../helpers";

beforeEach(resetDb);
describe("lokale teststand over de hele keten", () => {
  it("slaat bij een zoekronde uitsluitend de echte plaats Apeldoorn op", async () => {
    const { user } = await makeUser(); await saveConfig({ radar: { cityOnly: "Apeldoorn" } });
    const p = await prisma.searchProfile.create({ data: { userId: user.id, name: "Test", sourceKind: "SEARCH" } });
    const ads = ["Apeldoorn", "Ugchelen", "Omgeving Apeldoorn", null].map((location, i) => ({ externalId: `m123456780${i}`, title: "iPhone 16 Pro 256GB", location, distanceKm: i, imageUrls: [], url: `https://www.marktplaats.nl/v/x/m123456780${i}-iphone` }));
    const spy = vi.spyOn(searchAdapter, "fetchProfile").mockImplementation(async ctx => { await ctx.onAds?.(ads); return ads; });
    try {
      const r = await runProfileCheck(p.id); expect(r.created).toBe(1);
      expect((await prisma.advertisement.findMany()).map(a => a.location)).toEqual(["Apeldoorn"]);
    } finally { spy.mockRestore(); }
  });
  it("geeft buiten Apeldoorn geen match of nieuwe melding, ook bij een leeg/breed profiel", async () => {
    const { user } = await makeUser(); await saveConfig({ radar: { cityOnly: "Apeldoorn" }, notifications: { requireFullAnalysis: false } });
    const p = await prisma.searchProfile.create({ data: { userId: user.id, name: "Breed", sourceKind: "SEARCH", sourceConfig: { fastMode: true }, notifyMinScore: 0, lastSuccessAt: new Date(Date.now() - 60000) } });
    const a = await ingestAd({ externalId: "m1234567890", title: "iPhone 16 Pro 256GB", location: "Ugchelen", distanceKm: 2, imageUrls: [], url: "https://www.marktplaats.nl/v/x/m1234567890-iphone" }, { origin: "SEARCH", partial: true, enqueueAnalysis: false });
    await analyzeAd(a.adId);
    expect(await prisma.profileMatch.findUnique({ where: { profileId_adId: { profileId: p.id, adId: a.adId } } })).toMatchObject({ matched: false });
    expect(await prisma.notification.count()).toBe(0);
  });
  it("blijft voor een echte Apeldoorn-plaats één eerste melding maken", async () => {
    const { user } = await makeUser();
    await saveConfig({ radar: { cityOnly: "Apeldoorn" }, notifications: { requireFullAnalysis: false } });
    await prisma.searchProfile.create({ data: { userId: user.id, name: "Lokaal", sourceKind: "SEARCH", sourceConfig: { fastMode: true }, notifyChannels: [], notifyMinScore: 0, lastSuccessAt: new Date(Date.now() - 60000) } });
    const a = await ingestAd({ externalId: "m1234567890", title: "iPhone 16 Pro 256GB", askingCents: 30000, location: "Apeldoorn", distanceKm: 0, imageUrls: [], url: "https://www.marktplaats.nl/v/x/m1234567890-iphone" }, { origin: "SEARCH", partial: true, enqueueAnalysis: false });
    await analyzeAd(a.adId, { quick: true });
    await analyzeAd(a.adId, { quick: true });
    expect(await prisma.notification.count({ where: { adId: a.adId, channel: "INAPP", status: "SENT" } })).toBe(1);
  });
  it("slaat oude wachtende verzendingen over en verbergt historische buitenplaats-popups zonder data te verwijderen", async () => {
    const { user, cookie } = await makeUser();
    const a = await ingestAd({ externalId: "m1234567890", title: "iPhone 16 Pro", location: "Zwolle", imageUrls: [], url: "https://www.marktplaats.nl/v/x/m1234567890-iphone" }, { origin: "SEARCH", enqueueAnalysis: false });
    const n = await prisma.notification.create({ data: { userId: user.id, adId: a.adId, channel: "WEBPUSH", dedupeKey: "before-city", status: "PENDING" } });
    await prisma.notification.create({ data: { userId: user.id, adId: a.adId, channel: "INAPP", dedupeKey: "old-popup", status: "SENT" } });
    await saveConfig({ radar: { cityOnly: "Apeldoorn" } });
    const push = vi.fn(); await deliverNotification(n.id, undefined, { push });
    expect(push).not.toHaveBeenCalled(); expect(await prisma.notification.findUnique({ where: { id: n.id } })).toMatchObject({ status: "SKIPPED" });
    const r = await feed(req("/api/notify/feed?after=2020-01-01T00:00:00Z", { cookie }));
    expect((await r.json()).items).toEqual([]);
    expect(await prisma.advertisement.count()).toBe(1); expect(await prisma.notification.count()).toBe(2);
  });
});
