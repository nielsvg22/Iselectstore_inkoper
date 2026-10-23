import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { ingestAd } from "@/lib/pipeline/ingest";
import { saveTree } from "@/lib/pipeline/tree";
import { saveConfig } from "@/lib/settings/store";
import { GET as sharedGet, PUT as sharedPut } from "@/app/api/notify/shared/route";
import { makeUser, req, resetDb } from "../helpers";
import type { RawAd } from "@/lib/sources/types";

const raw = (id: string, o: Partial<RawAd> = {}): RawAd => ({
  externalId: id, url: `https://www.marktplaats.nl/v/x/${id}-iphone`, title: "iPhone 15 Pro 256GB", description: "Batterij 91%. iCloud vrij, simlockvrij. Mooi toestel zonder krassen, incl. oplader en doos. Ophalen mogelijk.",
  askingCents: 30000, location: "Apeldoorn", distanceKm: 20, imageUrls: ["https://img.example/1.jpg", "https://img.example/2.jpg", "https://img.example/3.jpg", "https://img.example/4.jpg"], shipping: ["pickup"], publishedAt: new Date(),
  seller: { id: "5", name: "Piet", verified: true, business: false, anonymous: false }, ...o,
});

async function setup() {
  const owner = await makeUser("ADMIN", "owner@example.com");
  const customer = await makeUser("USER", "klant@example.com");
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 }, notifications: { enabled: true, requireFullAnalysis: false } });
  const p = await prisma.searchProfile.create({ data: { userId: owner.user.id, name: "Radar", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: ["TELEGRAM"], sourceConfig: { queries: ["iphone"], baselineAt: new Date(Date.now() - 3600_000).toISOString() } } });
  await saveTree(p.id, { op: "AND", children: [] });
  for (const [u, e] of [[owner.user.id, "owner"], [customer.user.id, "klant"]] as const) await prisma.pushSubscription.create({ data: { userId: u, endpoint: `https://push.example/${e}`, p256dh: "p".repeat(30), auth: "a".repeat(12), label: e } });
  await prisma.marketComparable.createMany({ data: [700, 690, 710, 705, 695, 715, 702, 698].map((v, i) => ({ modelKey: "iphone-15-pro", storageGb: 256, priceCents: v * 100, kind: "ASKING_CURRENT" as const, observedAt: new Date(Date.now() - i * 86400000) })) });
  return { owner, customer };
}
const analyze = async (id: string, o: Partial<RawAd> = {}) => { const a = await ingestAd(raw(id, o), { origin: "SEARCH", partial: false }); await analyzeAd(a.adId); return a.adId; };

beforeEach(async () => { await resetDb(); });

describe("dealmeldingen van de radar delen met andere accounts", () => {
  it("zonder delen krijgt alleen de eigenaar een melding; met delen ook de klant (één melding per account)", async () => {
    const { owner, customer } = await setup();
    await analyze("m7000001");
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", userId: customer.user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", userId: owner.user.id } })).toBe(1);

    const put = await sharedPut(req("/api/notify/shared", { method: "PUT", cookie: owner.cookie, body: { userIds: [customer.user.id, "bestaat-niet"] } }));
    expect(((await put.json()) as { userIds: string[] }).userIds).toEqual([customer.user.id]);
    await analyze("m7000002", { title: "iPhone 15 Pro 256GB Blauw Titanium", imageUrls: ["https://img.example/b1.jpg", "https://img.example/b2.jpg", "https://img.example/b3.jpg"] });
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", userId: customer.user.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { channel: "INAPP", userId: customer.user.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", userId: owner.user.id } })).toBe(2);
  });

  it("de voorkeuren van de klant gelden voor de klant (bijv. push uit)", async () => {
    const { owner, customer } = await setup();
    await sharedPut(req("/api/notify/shared", { method: "PUT", cookie: owner.cookie, body: { userIds: [customer.user.id] } }));
    await prisma.user.update({ where: { id: customer.user.id }, data: { notifyPrefs: { push: false } } });
    await analyze("m7000003", { title: "iPhone 15 Pro 256GB Zwart Titanium", imageUrls: ["https://img.example/c1.jpg", "https://img.example/c2.jpg", "https://img.example/c3.jpg"] });
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", userId: customer.user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { channel: "WEBPUSH", userId: owner.user.id } })).toBe(1);
  });

  it("alleen beheerders mogen het instellen of bekijken", async () => {
    const { owner, customer } = await setup();
    expect((await sharedGet(req("/api/notify/shared", { cookie: customer.cookie }))).status).toBe(403);
    expect((await sharedPut(req("/api/notify/shared", { method: "PUT", cookie: customer.cookie, body: { userIds: [customer.user.id] } }))).status).toBe(403);
    expect((await sharedGet(req("/api/notify/shared"))).status).toBe(401);
    expect(((await (await sharedGet(req("/api/notify/shared", { cookie: owner.cookie }))).json()) as { userIds: string[] }).userIds).toEqual([]);
  });
});
