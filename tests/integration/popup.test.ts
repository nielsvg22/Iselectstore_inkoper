import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { ingestAd } from "@/lib/pipeline/ingest";
import { saveTree } from "@/lib/pipeline/tree";
import { saveConfig } from "@/lib/settings/store";
import { setPrefs } from "@/lib/notify/prefs";
import { GET as feedGet } from "@/app/api/notify/feed/route";
import { makeUser, req, resetDb } from "../helpers";
import type { RawAd } from "@/lib/sources/types";

const raw = (o: Partial<RawAd> = {}): RawAd => ({
  externalId: "m3000001", url: "https://www.marktplaats.nl/v/x/m3000001-iphone", title: "iPhone 15 Pro 256GB", description: "Batterij 91%. iCloud vrij, simlockvrij. Mooi toestel zonder krassen, incl. oplader en doos. Ophalen mogelijk.",
  askingCents: 30000, location: "Utrecht", distanceKm: 34, imageUrls: ["https://img.example/1.jpg"], shipping: ["pickup"], publishedAt: new Date(),
  seller: { id: "5", name: "Piet", verified: true, business: false, anonymous: false }, ...o,
});

async function setup(baselineAgoMs = 3600_000) {
  const { user, cookie } = await makeUser();
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 }, notifications: { enabled: true, requireFullAnalysis: false } });
  const p = await prisma.searchProfile.create({ data: { userId: user.id, name: "P", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: ["TELEGRAM"], sourceConfig: { queries: ["iphone"], baselineAt: new Date(Date.now() - baselineAgoMs).toISOString() } } });
  await saveTree(p.id, { op: "AND", children: [] });
  await prisma.marketComparable.createMany({ data: [700, 690, 710, 705, 695, 715, 702, 698].map((v, i) => ({ modelKey: "iphone-15-pro", storageGb: 256, priceCents: v * 100, kind: "ASKING_CURRENT" as const, observedAt: new Date(Date.now() - i * 86400000) })) });
  return { user, cookie };
}

beforeEach(async () => { await resetDb(); });

describe("in-app pop-up", () => {
  it("maakt één INAPP-melding per gebruiker/advertentie en de feed levert die", async () => {
    const { user, cookie } = await setup();
    const a = await ingestAd(raw(), { origin: "SEARCH", partial: false });
    await analyzeAd(a.adId);
    await analyzeAd(a.adId);
    expect(await prisma.notification.count({ where: { channel: "INAPP", userId: user.id } })).toBe(1);
    const r = await feedGet(req("/api/notify/feed?after=2000-01-01T00:00:00Z", { cookie }));
    const j = (await r.json()) as { items: Array<{ adId: string; askingCents: number }> };
    expect(j.items).toHaveLength(1);
    expect(j.items[0].adId).toBe(a.adId);
    expect(j.items[0].askingCents).toBe(30000);
    // cursor: niets nieuws na de laatste
    const again = (await (await feedGet(req(`/api/notify/feed?after=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`, { cookie }))).json()) as { items: unknown[] };
    expect(again.items).toHaveLength(0);
  });

  it("geen pop-up als uitgezet, en feed vereist inloggen", async () => {
    const { user } = await setup();
    await setPrefs(user.id, { popup: false });
    const a = await ingestAd(raw({ externalId: "m3000002", url: "https://www.marktplaats.nl/v/x/m3000002-iphone" }), { origin: "SEARCH", partial: false });
    await analyzeAd(a.adId);
    expect(await prisma.notification.count({ where: { channel: "INAPP" } })).toBe(0);
    expect((await feedGet(req("/api/notify/feed"))).status).toBe(401);
  });

  it("geen pop-up tijdens de nulmeting", async () => {
    await setup(-60_000); // baseline ligt in de toekomst → nulmeting loopt
    const a = await ingestAd(raw({ externalId: "m3000003", url: "https://www.marktplaats.nl/v/x/m3000003-iphone" }), { origin: "SEARCH", partial: false });
    await analyzeAd(a.adId);
    expect(await prisma.notification.count({ where: { channel: "INAPP" } })).toBe(0);
  });
});
