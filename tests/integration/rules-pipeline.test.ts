import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { ingestAd } from "@/lib/pipeline/ingest";
import { saveTree } from "@/lib/pipeline/tree";
import { saveConfig } from "@/lib/settings/store";
import { saveBasePrices, saveRules, getBasePrices, getRules } from "@/lib/rules/config";
import { clearRulesCache } from "@/lib/rules/apply";
import { dealMessageForAd } from "@/lib/notify/dispatch";
import { buildPushPayload } from "@/lib/notify/message";
import { makeUser, resetDb } from "../helpers";
import type { RawAd } from "@/lib/sources/types";

const raw = (o: Partial<RawAd> = {}): RawAd => ({
  externalId: "m4000001", url: "https://www.marktplaats.nl/v/x/m4000001-iphone", title: "iPhone 15 Pro 256GB",
  description: "Batterij 91%. Krasvrij, altijd in hoesje en screenprotector. iCloud vrij, simlockvrij. Incl. oplader en doos. Ophalen mogelijk.",
  askingCents: 30000, location: "Apeldoorn", distanceKm: 34, imageUrls: ["https://img.example/1.jpg", "https://img.example/2.jpg", "https://img.example/3.jpg"],
  shipping: ["pickup", "shipping"], publishedAt: new Date(),
  seller: { id: "5", name: "Piet", verified: true, business: false, anonymous: false }, attributes: { priceType: "FIXED", condition: "Gebruikt" }, ...o,
});

async function setup() {
  const { user } = await makeUser();
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 }, notifications: { enabled: true, requireFullAnalysis: false } });
  const p = await prisma.searchProfile.create({ data: { userId: user.id, name: "P", sourceKind: "SEARCH", notifyMinScore: 95, notifyChannels: ["TELEGRAM"], sourceConfig: { queries: ["iphone"], baselineAt: new Date(Date.now() - 3600_000).toISOString() } } });
  await saveTree(p.id, { op: "AND", children: [] });
  await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/abc", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
  await saveBasePrices([{ modelKey: "iphone-15-pro", storageGb: 256, priceEuro: 700, kind: "sell" }]);
  clearRulesCache();
  return { user };
}
const pushCount = () => prisma.notification.count({ where: { channel: "WEBPUSH" } });
async function analyzed(r: RawAd) {
  const a = await ingestAd(r, { origin: "SEARCH", partial: false });
  await analyzeAd(a.adId);
  return a.adId;
}

beforeEach(async () => { await resetDb(); clearRulesCache(); });

describe("inkoopregels in de beoordelingsketen", () => {
  it("een deal binnen de regels meldt (ook onder de dealscore-drempel van het profiel) en legt het oordeel vast", async () => {
    await setup();
    const id = await analyzed(raw());
    const a = await prisma.dealAnalysis.findFirstOrThrow({ where: { adId: id, isCurrent: true } });
    const rules = (a.costs as { rules: { status: string; maxSellEuro: number; allowedAsk: number; flags: string[] } }).rules;
    expect(["match", "high"]).toContain(rules.status);
    expect(rules.maxSellEuro).toBeGreaterThan(500);
    expect(rules.flags).toContain("scratchFree");
    expect(await pushCount()).toBe(1);
  });

  it("te dure advertentie wordt niet gemeld, ook niet als de dealscore hoog zou zijn", async () => {
    await setup();
    await analyzed(raw({ externalId: "m4000002", url: "https://www.marktplaats.nl/v/x/m4000002-iphone", askingCents: 65000 }));
    expect(await pushCount()).toBe(0);
  });

  it("batterij onder 80% wordt nooit gemeld", async () => {
    await setup();
    await analyzed(raw({ externalId: "m4000003", url: "https://www.marktplaats.nl/v/x/m4000003-iphone", description: "Batterij 78%. Krasvrij. iCloud vrij. Incl. oplader en doos." }));
    expect(await pushCount()).toBe(0);
  });

  it("zonder basisprijs of met regels uit: bestaande logica blijft leidend (oordeel 'skip')", async () => {
    await setup();
    await saveRules({ ...(await getRules()), enabled: false });
    clearRulesCache();
    const id = await analyzed(raw({ externalId: "m4000004", url: "https://www.marktplaats.nl/v/x/m4000004-iphone" }));
    const a = await prisma.dealAnalysis.findFirstOrThrow({ where: { adId: id, isCurrent: true } });
    expect((a.costs as { rules: { status: string } }).rules.status).toBe("skip");
  });

  it("verzending meenemen uit: buiten 40 km hemelsbreed geen melding, ook niet voor modellen zonder basisprijs", async () => {
    await setup();
    await saveRules({ ...(await getRules()), distance: { ...(await getRules()).distance, includeShipping: false, pickupMaxKm: 40 } });
    clearRulesCache();
    // iPhone 14 heeft geen basisprijs: de bestaande waardering beslist, maar de afstandsgrens geldt altijd
    await analyzed(raw({ externalId: "m4000010", url: "https://www.marktplaats.nl/v/x/m4000010-iphone", title: "iPhone 14 128GB", distanceKm: 92, shipping: ["pickup", "shipping"], seller: { id: "9", name: "Ver", verified: true, business: false, anonymous: false, rating: 5, reviewCount: 200, accountAgeMonths: 200 } }));
    expect(await pushCount()).toBe(0);
    await analyzed(raw({ externalId: "m4000011", url: "https://www.marktplaats.nl/v/x/m4000011-iphone", distanceKm: 92, seller: { id: "9", name: "Ver", verified: true, business: false, anonymous: false, rating: 5, reviewCount: 200, accountAgeMonths: 200 }, shipping: ["pickup", "shipping"] }));
    expect(await pushCount()).toBe(0);
    await analyzed(raw({ externalId: "m4000012", url: "https://www.marktplaats.nl/v/x/m4000012-iphone", title: "iPhone 15 Pro 256GB Blauw Titanium", imageUrls: ["https://img.example/b1.jpg", "https://img.example/b2.jpg", "https://img.example/b3.jpg"], distanceKm: 30 }));
    expect(await pushCount()).toBe(1);
  });

  it("prijs uit tekst als de advertentie geen prijs heeft", async () => {
    await setup();
    const id = await analyzed(raw({ externalId: "m4000005", url: "https://www.marktplaats.nl/v/x/m4000005-iphone", askingCents: null, attributes: { priceType: "SEE_DESCRIPTION" }, description: "Vraagprijs €310. Batterij 91%. Krasvrij." }));
    const a = await prisma.dealAnalysis.findFirstOrThrow({ where: { adId: id, isCurrent: true } });
    const rules = (a.costs as { rules: { askEuro: number; textPrices: { ask: number } } }).rules;
    expect(rules.textPrices.ask).toBe(310);
    expect(rules.askEuro).toBe(310);
  });

  it("de melding bevat max verkoopprijs, toegestane prijzen en emoji", async () => {
    await setup();
    const id = await analyzed(raw({ externalId: "m4000006", url: "https://www.marktplaats.nl/v/x/m4000006-iphone" }));
    const m = await dealMessageForAd(id);
    expect(m?.rules?.maxSellEuro).toBeGreaterThan(0);
    const p = buildPushPayload(m!, `/ads/${id}`);
    expect(p.body).toMatch(/Max €\d+ · toegestaan vraag €\d+ \/ bieden €\d+/);
    expect(p.title).toMatch(/iPhone 15 Pro 256GB/);
  });

  it("prijzen opslaan is idempotent en bewaart een wijzigingslog; iPad-lijst is voorgevuld", async () => {
    await resetDb();
    const seed = await getBasePrices();
    expect(seed.some((p) => p.modelKey === "ipad-mini-7" && p.storageGb === 256 && p.priceEuro === 550)).toBe(true);
    await saveBasePrices([{ modelKey: "iphone-14", storageGb: 128, priceEuro: 300, kind: "sell" }, { modelKey: "iphone-14", storageGb: 128, priceEuro: 310, kind: "sell" }]);
    expect(await getBasePrices()).toHaveLength(1);
    expect((await getBasePrices())[0].priceEuro).toBe(310);
    expect(await prisma.auditLog.count({ where: { action: "rules.prices_changed" } })).toBe(1);
  });
});
