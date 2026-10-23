import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { ingestAd } from "@/lib/pipeline/ingest";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { extractMNumbers, funnelStats, markClicked, markOpened, offerOverview, registerPurchases } from "@/lib/funnel";
import { saveConfig, setSecret } from "@/lib/settings/store";
import { getBasePrices, getRules, saveBasePrices, saveRules } from "@/lib/rules/config";
import { applyMonthlyAdjustment, pollTelegramPurchases } from "@/lib/rules/maintenance";
import { purchaseAudit } from "@/lib/rules/audit";
import { clearRulesCache } from "@/lib/rules/apply";
import { POST as openPost } from "@/app/api/funnel/open/route";
import { POST as clickPost } from "@/app/api/funnel/click/route";
import { POST as mPost } from "@/app/api/funnel/mnumbers/route";
import { makeUser, req, resetDb } from "../helpers";
import type { RawAd } from "@/lib/sources/types";

const raw = (id: string, o: Partial<RawAd> = {}): RawAd => ({
  externalId: id, url: `https://www.marktplaats.nl/v/x/${id}-iphone`, title: "iPhone 15 Pro 256GB", description: "Batterij 91%. Krasvrij. iCloud vrij. Incl. oplader en doos.",
  askingCents: 30000, location: "Apeldoorn", distanceKm: 20, imageUrls: ["https://img.example/1.jpg"], shipping: ["pickup"], publishedAt: new Date(),
  seller: { id: "5", name: "Piet", verified: true, business: false, anonymous: false }, attributes: { priceType: "FIXED", condition: "Gebruikt" }, ...o,
});
async function sentNotification(userId: string, adId: string, channel: "WEBPUSH" | "INAPP" = "WEBPUSH") {
  return prisma.notification.create({ data: { adId, userId, channel, dedupeKey: `${channel}:${adId}:${userId}`, status: "SENT", sentAt: new Date() } });
}
async function adWithProduct(id: string, o: Partial<RawAd> = {}) {
  const a = await ingestAd(raw(id, o), { origin: "SEARCH", partial: false });
  await analyzeAd(a.adId);
  return a.adId;
}

beforeEach(async () => { await resetDb(); clearRulesCache(); });

describe("funnel", () => {
  it("herkent M-nummers in vrije tekst", () => {
    expect(extractMNumbers("Gekocht: M2158666552 en m2158666553, nogmaals m2158666552! en abc")).toEqual(["m2158666552", "m2158666553"]);
  });

  it("verstuurd → geopend → doorgeklikt → gekocht, per model", async () => {
    const { user, cookie } = await makeUser();
    const a1 = await adWithProduct("m5000001");
    const a2 = await adWithProduct("m5000002");
    await sentNotification(user.id, a1);
    await sentNotification(user.id, a2);
    expect((await openPost(req("/api/funnel/open", { method: "POST", body: { adId: a1 }, cookie }))).status).toBe(200);
    expect(await markOpened(user.id, a1)).toBe(0); // al geopend: niets meer te doen
    await clickPost(req("/api/funnel/click", { method: "POST", body: { adId: a1 }, cookie }));
    await mPost(req("/api/funnel/mnumbers", { method: "POST", body: { text: "gekocht m5000001" }, cookie }));
    const f = await funnelStats(null, 30);
    expect(f.totals).toEqual({ sent: 2, opened: 1, clicked: 1, bought: 1 });
    expect(f.rows[0].label).toMatch(/iPhone 15 Pro/);
    expect(f.unopened).toHaveLength(1);
    expect(f.unopened[0].adId).toBe(a2);
    expect(f.unopened[0].askEuro).toBe(300);
  });

  it("klikken telt ook als geopend, en een andere gebruiker raakt de meldingen niet", async () => {
    const { user } = await makeUser("ADMIN", "a@example.com");
    const other = await makeUser("USER", "b@example.com");
    const a = await adWithProduct("m5000003");
    await sentNotification(user.id, a, "INAPP");
    expect(await markClicked(other.user.id, a)).toBe(0);
    expect(await markClicked(user.id, a)).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { adId: a } });
    expect(n.openedAt).toBeTruthy();
    expect(n.clickedAt).toBeTruthy();
  });

  it("M-nummers registreren is idempotent en koppelt aan bekende advertenties", async () => {
    const { user } = await makeUser();
    const a = await adWithProduct("m5000004");
    const first = await registerPurchases(user.id, "m5000004 m9999999999");
    expect(first.map((r) => [r.mNumber, r.created, Boolean(r.adId)])).toEqual([["m5000004", true, true], ["m9999999999", true, false]]);
    const second = await registerPurchases(user.id, "m5000004");
    expect(second[0].created).toBe(false);
    expect(await prisma.purchase.count()).toBe(2);
    expect((await prisma.purchase.findFirstOrThrow({ where: { mNumber: "m5000004" } })).modelKey).toBe("iphone-15-pro");
    expect(a).toBeTruthy();
  });

  it("aanbod per model: twee periodes, bieden vanaf 0 en batterijverdeling", async () => {
    await makeUser();
    await adWithProduct("m5000005");
    await adWithProduct("m5000006", { askingCents: 0, attributes: { priceType: "MIN_BID" }, description: "Batterij 78%." });
    const o = await offerOverview(14);
    const row = o.rows.find((r) => r.modelKey === "iphone-15-pro")!;
    expect(row.received).toBe(2);
    expect(row.bidZero).toBe(1);
    expect(row.avgAsk).toBe(300);
    expect(row.battery["95-100"] + row.battery["90-94"] + row.battery["<80"]).toBe(2);
    expect(row.prev.received).toBe(0);
  });

  it("seenCount telt hoe vaak een advertentie in zoekresultaten is teruggezien", async () => {
    await makeUser();
    const a = await ingestAd(raw("m5000007"), { origin: "SEARCH", partial: true });
    await ingestAd(raw("m5000007"), { origin: "SEARCH", partial: true });
    await ingestAd(raw("m5000007"), { origin: "SEARCH", partial: true });
    expect((await prisma.advertisement.findUniqueOrThrow({ where: { id: a.adId } })).seenCount).toBe(3);
  });
});

describe("ingekocht: wat zeiden de regels", () => {
  it("telt per oordeel, noemt de regel die tegenhield en de advertenties die de app nooit zag", async () => {
    const { user } = await makeUser();
    await saveBasePrices([{ modelKey: "iphone-15-pro", storageGb: 256, priceEuro: 700, kind: "sell" }]);
    clearRulesCache();
    const good = await adWithProduct("m6100001"); // 300 euro, krasvrij: ruim binnen de regels
    const dear = await adWithProduct("m6100002", { title: "iPhone 15 Pro 256GB Blauw", imageUrls: ["https://img.example/z1.jpg", "https://img.example/z2.jpg", "https://img.example/z3.jpg"], askingCents: 65000 });
    await registerPurchases(user.id, "m6100001 m6100002 m6199999");
    const audit = await purchaseAudit(null, 30);
    expect(audit.total).toBe(3);
    expect(audit.notSeen).toBe(1);
    expect(audit.counts.reject).toBe(1);
    expect(audit.counts.high + audit.counts.match).toBe(1);
    expect(audit.strictest).toEqual([{ step: "price-too-high", title: "Prijs binnen de toegestane vraagprijs of bieden vanaf?", n: 1 }]);
    expect(audit.highSharePct).toBe(50);
    const unseen = audit.rows.find((r) => r.mNumber === "m6199999")!;
    expect(unseen.status).toBe("unknown");
    expect(unseen.reason).toMatch(/nooit gezien/);
    expect(good && dear).toBeTruthy();
  });
});

describe("onderhoud", () => {
  it("maandelijkse prijsaanpassing: eenmaal per maand, met logboek", async () => {
    await saveBasePrices([{ modelKey: "iphone-14", storageGb: 128, priceEuro: 300, kind: "sell" }]);
    await saveRules({ ...(await getRules()), monthly: { enabled: true, percent: -5, lastAppliedMonth: "" } });
    const now = new Date("2026-11-03T10:00:00Z");
    expect((await applyMonthlyAdjustment(now)).applied).toBe(true);
    expect((await getBasePrices())[0].priceEuro).toBe(285);
    expect((await applyMonthlyAdjustment(now)).applied).toBe(false);
    expect((await getBasePrices())[0].priceEuro).toBe(285);
    expect((await applyMonthlyAdjustment(new Date("2026-12-01T00:00:00Z"))).applied).toBe(true);
    expect((await getBasePrices())[0].priceEuro).toBe(271); // 285 × 0,95 = 270,75
    expect(await prisma.auditLog.count({ where: { action: "rules.prices_changed" } })).toBe(3);
  });

  it("Telegram: M-nummers uit het kanaal worden aankoop; herinnering na 3 stille dagen", async () => {
    const { user } = await makeUser();
    await saveConfig({ telegram: { chatId: "999" } });
    await setSecret("telegram.botToken", "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh");
    await saveRules({ ...(await getRules()), telegramPurchases: { enabled: true, chatId: "-100500", silentDaysAlert: 3 } });
    const sent: string[] = [];
    const t0 = new Date("2026-11-01T12:00:00Z");
    const fetchStub = (updates: unknown[]) => (async (url: string, init?: RequestInit) => {
      if (String(url).includes("getUpdates")) return new Response(JSON.stringify({ ok: true, result: updates }));
      sent.push(String(init?.body));
      return new Response(JSON.stringify({ ok: true }));
    }) as unknown as typeof fetch;
    const r1 = await pollTelegramPurchases(t0, fetchStub([
      { update_id: 10, channel_post: { chat: { id: -100500 }, text: "Gekocht m6000001", date: Math.floor(t0.getTime() / 1000) } },
      { update_id: 11, channel_post: { chat: { id: -100999 }, text: "m6000002 verkeerd kanaal" } },
    ]));
    expect(r1.registered).toBe(1);
    expect(await prisma.purchase.count({ where: { userId: user.id } })).toBe(1);
    const r2 = await pollTelegramPurchases(new Date(t0.getTime() + 2 * 86400_000), fetchStub([]));
    expect(r2.alerted).toBe(false);
    const r3 = await pollTelegramPurchases(new Date(t0.getTime() + 4 * 86400_000), fetchStub([]));
    expect(r3.alerted).toBe(true);
    expect(sent.some((b) => b.includes("geen gekochte advertenties"))).toBe(true);
    const r4 = await pollTelegramPurchases(new Date(t0.getTime() + 5 * 86400_000), fetchStub([]));
    expect(r4.alerted).toBe(false); // niet elke keer opnieuw
  });
});
