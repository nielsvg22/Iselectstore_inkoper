import { describe, expect, it } from "vitest";
import { classifyAccessory } from "@/lib/rules/accessory";
import { defaultRules } from "@/lib/rules/config";
import type { SearchFilter } from "@/lib/rules/filters";
import { marginFor } from "@/lib/rules/margin-filter";
import { evaluateRules, type VerdictInput } from "@/lib/rules/verdict";
import { notifyPrefsSchema, passesPrefs } from "@/lib/notify/prefs";

const NOW = new Date("2026-10-27T10:00:00Z");
const f = (o: Partial<SearchFilter>): SearchFilter => ({ id: Math.random().toString(), modelKey: "iphone-15-pro", variant: "", storageGb: 256, condition: "normal", minEuro: 200, maxEuro: 800, maxKm: 300, adType: "all", sellerType: "Alle", sellerMinMonths: 0, active: true, resaleEuro: null, minMarginEuro: null, ...o });
const base = defaultRules();
const cfg = { ...base, priceBase: "buy85" as const, filters: { enabled: true, outsideList: "reject" as const }, distance: { ...base.distance, includeShipping: true } };
const input = (o: Partial<VerdictInput> = {}): VerdictInput => ({
  modelKey: "iphone-15-pro", modelLabel: "iPhone 15 Pro", family: "iphone", storageGb: 256, ramGb: null, chip: null, screenInch: null, connectivity: null,
  batteryPct: 90, title: "iPhone 15 Pro 256GB", text: "iPhone 15 Pro 256GB krasvrij", mpCondition: null, priceType: "FIXED", askEuro: 500, bidEuro: null, latitude: null, longitude: null,
  distanceKm: 10, shippingOffered: true, seller: { ageMonths: 60, reviews: 20, rating: 4.9, verified: true }, directBuy: false, now: NOW, ...o,
});
const ok = (s: string) => expect(["match", "high", "review"]).toContain(s);

const IPAD = f({ modelKey: "ipad-mini-6", storageGb: null, minEuro: 50, maxEuro: 150 });
const ipad = (o: Partial<VerdictInput> = {}) => input({ family: "ipad", modelKey: "ipad-mini-6", modelLabel: "iPad mini 6", storageGb: null, batteryPct: null, title: "iPad mini 6", text: "iPad mini 6 wifi", ...o });

describe("prijsvenster per model (iPad mini 6: €50–€150)", () => {
  it("€120 → toegestaan", () => ok(evaluateRules(ipad({ askEuro: 120 }), [], cfg, [IPAD]).status));
  it("€20 → uitgesloten door de minimumprijs", () => {
    const v = evaluateRules(ipad({ askEuro: 20, title: "iPad mini 6 wifi 64GB" }), [], cfg, [IPAD]);
    expect(v).toMatchObject({ status: "reject", decidedBy: "price-window" });
    expect(v.reasons[0]).toContain("minimumprijs");
  });
  it("€180 → uitgesloten door de maximumprijs", () => {
    const v = evaluateRules(ipad({ askEuro: 180 }), [], cfg, [IPAD]);
    expect(v).toMatchObject({ status: "reject", decidedBy: "price-window" });
    expect(v.reasons[0]).toContain("maximumprijs");
  });
  it("model buiten de lijst of op inactief → uitgesloten", () => {
    expect(evaluateRules(ipad({ modelKey: "ipad-mini-7" }), [], cfg, [IPAD])).toMatchObject({ status: "reject", decidedBy: "model-list" });
    expect(evaluateRules(ipad(), [], cfg, [{ ...IPAD, active: false }])).toMatchObject({ status: "reject", decidedBy: "model-list" });
  });
});

describe("accessoires", () => {
  const a = defaultRules().accessories;
  const c = (title: string, priceEuro: number | null, storageGb: number | null = null, description = "") => classifyAccessory({ title, description, priceEuro, storageGb, filterMinEuro: 0 }, a);
  it('"iPhone 15 Pro inclusief hoesje" blijft een telefoon', () => {
    expect(c("iPhone 15 Pro inclusief hoesje", 600, 256, "iPhone 15 Pro 256GB").accessory).toBe(false);
    expect(c("iPhone 15 Pro 256GB met hoesje en oplader", 600, 256).accessory).toBe(false);
    expect(c("iPhone 15 Pro + hoesje", 600).accessory).toBe(false);
  });
  it('"iPhone 15 Pro hoesje" en "hoesje voor iPhone" zijn accessoires', () => {
    expect(c("iPhone 15 Pro hoesje", 20)).toMatchObject({ accessory: true, kind: "accessoire" });
    expect(c("Hoesje voor iPhone 15 Pro", 15)).toMatchObject({ accessory: true });
    expect(c("Screenprotector iPhone 15 Pro", 8)).toMatchObject({ accessory: true });
    expect(c("Lightning kabel 2m", 10)).toMatchObject({ accessory: true });
  });
  it("een iPad Pro-hoesje van €25 is een accessoire", () => expect(c("iPad Pro 11 inch hoesje", 25)).toMatchObject({ accessory: true }));
  it("onderdelen en lege dozen worden uitgesloten", () => {
    expect(c("iPhone 15 Pro voor onderdelen", 150)).toMatchObject({ accessory: true, kind: "onderdeel" });
    expect(c("iPhone 15 Pro alleen doos", 15)).toMatchObject({ accessory: true, kind: "onderdeel" });
    expect(c("iPhone 15 Pro zonder onderdelen, werkt perfect", 600, 256).accessory).toBe(false);
  });
  it("een duur apparaat met accessoirewoord en opslag blijft staan", () => expect(c("iPhone 15 Pro 256GB hoesje cadeau", 600, 256).accessory).toBe(false));
  it("is aanpasbaar: eigen woord toevoegen of uitzetten", () => {
    expect(classifyAccessory({ title: "iPhone 15 Pro sticker", description: "", priceEuro: 5, storageGb: null, filterMinEuro: 0 }, { ...a, terms: [...a.terms, "sticker"] })).toMatchObject({ accessory: true });
    expect(classifyAccessory({ title: "iPhone 15 Pro hoesje", description: "", priceEuro: 5, storageGb: null, filterMinEuro: 0 }, { ...a, enabled: false }).accessory).toBe(false);
  });
  it("in de regelmotor: een iPad Pro-hoesje van €25 geeft geen melding", () => {
    const pro = f({ modelKey: "ipad-pro-11-m4", storageGb: null, minEuro: 300, maxEuro: 900 });
    const v = evaluateRules(input({ family: "ipad", modelKey: "ipad-pro-11-m4", modelLabel: "iPad Pro 11 M4", storageGb: null, batteryPct: null, title: "iPad Pro 11 inch hoesje", text: "iPad Pro 11 inch hoesje", askEuro: 25 }), [], cfg, [pro]);
    expect(v).toMatchObject({ status: "reject", decidedBy: "accessory" });
  });
});

describe("margefilter", () => {
  const mcfg = { ...cfg, margin: { ...cfg.margin, enabled: true } };
  const lst = [f({ resaleEuro: 700, minMarginEuro: 150 })];
  it("verwachte winst = doorverkoop − inkoop − kosten; maximale inkoop = doorverkoop − marge", () => {
    const m = marginFor({ platform: "marktplaats", purchaseEuro: 350, resaleEuro: 500, modelMinMarginEuro: 150 }, base.margin);
    expect(m).toMatchObject({ profitEuro: 150, requiredEuro: 150, maxPurchaseEuro: 350, ok: true });
    expect(marginFor({ platform: "marktplaats", purchaseEuro: 360, resaleEuro: 500, modelMinMarginEuro: 150 }, base.margin).ok).toBe(false);
  });
  it("kosten zijn instelbaar per platform", () => {
    const withCosts = { ...base.margin, costs: { ...base.margin.costs, vinted: { shippingEuro: 6, protectionPct: 5, protectionFixedEuro: 0.7, otherEuro: 0 } }, useListedPlatformCosts: false };
    const m = marginFor({ platform: "vinted", purchaseEuro: 300, resaleEuro: 500, modelMinMarginEuro: 100 }, withCosts);
    expect(m.costsEuro).toBe(21.7);
    expect(m.profitEuro).toBe(178.3);
    // Vinted-kosten uit de advertentie
    const listed = marginFor({ platform: "vinted", purchaseEuro: 295, resaleEuro: 500, modelMinMarginEuro: 100, listedProtectionCents: 1545, listedShippingCents: 569 }, { ...base.margin, useListedPlatformCosts: true });
    expect(listed.costsEuro).toBe(21.14);
  });
  it("marge per verkoopprijssegment als het model geen eigen marge heeft", () => {
    const segs = { ...base.margin, segments: [{ fromResaleEuro: 0, minMarginEuro: 50 }, { fromResaleEuro: 300, minMarginEuro: 100 }, { fromResaleEuro: 600, minMarginEuro: 150 }] };
    expect(marginFor({ platform: "marktplaats", purchaseEuro: 100, resaleEuro: 200, modelMinMarginEuro: null }, segs).requiredEuro).toBe(50);
    expect(marginFor({ platform: "marktplaats", purchaseEuro: 100, resaleEuro: 450, modelMinMarginEuro: null }, segs).requiredEuro).toBe(100);
    expect(marginFor({ platform: "marktplaats", purchaseEuro: 100, resaleEuro: 900, modelMinMarginEuro: null }, segs).requiredEuro).toBe(150);
  });
  it("iPhone met onvoldoende marge → geen melding; met voldoende marge → door", () => {
    const low = evaluateRules(input({ askEuro: 600 }), [], mcfg, lst);
    expect(low).toMatchObject({ status: "reject", decidedBy: "margin" });
    expect(low.reasons[0]).toContain("maximale inkoopprijs €550");
    const good = evaluateRules(input({ askEuro: 540 }), [], mcfg, lst);
    ok(good.status);
    expect(good.profit).toMatchObject({ profitEuro: 160, ok: true });
  });
  it("zonder doorverkoopprijs wordt het margefilter niet toegepast (met uitleg)", () => {
    const v = evaluateRules(input({ askEuro: 790 }), [], mcfg, [f({})]);
    expect(v.decidedBy).not.toBe("margin");
    expect(v.notes.join(" ")).toContain("margefilter niet toegepast");
  });
  it("alle voorwaarden moeten kloppen: prijsvenster én marge", () => {
    expect(evaluateRules(input({ askEuro: 150 }), [], mcfg, lst)).toMatchObject({ decidedBy: "price-window" });
    expect(evaluateRules(input({ askEuro: 850 }), [], mcfg, lst)).toMatchObject({ decidedBy: "price-window" });
  });
});

describe("batterijfilter (nooit een percentage verzinnen)", () => {
  const bcfg = (policy: "show" | "exclude" | "mark", min = 85) => ({ ...cfg, battery: { ...cfg.battery, filterMinPct: min, unknownPolicy: policy } });
  const lst = [f({})];
  it("te laag → uitgesloten, genoeg → door, met bron", () => {
    expect(evaluateRules(input({ batteryPct: 82 }), [], bcfg("show"), lst)).toMatchObject({ status: "reject", decidedBy: "battery-filter" });
    const v = evaluateRules(input({ batteryPct: 91, batteryEvidence: "Batterijconditie 91%" }), [], bcfg("show"), lst);
    ok(v.status);
    expect(v.battery).toMatchObject({ pct: 91, source: "Batterijconditie 91%", known: true });
  });
  it("niet genoemd: tonen, uitsluiten of markeren", () => {
    expect(evaluateRules(input({ batteryPct: null }), [], bcfg("exclude"), lst)).toMatchObject({ status: "reject", decidedBy: "battery-filter" });
    ok(evaluateRules(input({ batteryPct: null }), [], bcfg("show"), lst).status);
    const marked = evaluateRules(input({ batteryPct: null }), [], bcfg("mark"), lst);
    expect(marked.flags).toContain("batteryUnknown");
    ok(marked.status);
  });
  it("een aanname op leeftijd telt nooit als gevonden percentage", () => {
    const v = evaluateRules(input({ batteryPct: null }), [], bcfg("exclude"), lst);
    expect(v.battery.known).toBe(false);
    expect(v.status).toBe("reject");
  });
  it("filter uit (0) → geen invloed", () => ok(evaluateRules(input({ batteryPct: null }), [], bcfg("exclude", 0), lst).status));
});

describe("land, bescherming en verkoper", () => {
  const lst = [f({})];
  const vinted = (o: Partial<VerdictInput> = {}) => input({ platform: "vinted", distanceKm: null, shippingOffered: true, ...o });
  it("een advertentie uit Frankrijk wordt uitgesloten als alleen Nederland actief is", () => {
    const v = evaluateRules(vinted({ country: "FR" }), [], cfg, lst);
    expect(v).toMatchObject({ status: "reject", decidedBy: "country" });
    expect(v.reasons[0]).toContain("FR");
    ok(evaluateRules(vinted({ country: "NL" }), [], cfg, lst).status);
  });
  it("later Frankrijk erbij zetten", () => ok(evaluateRules(vinted({ country: "FR" }), [], { ...cfg, country: { ...cfg.country, allowed: ["NL", "FR"] } }, lst).status));
  it("Marktplaats telt als Nederland; Vinted zonder land is onbekend en wordt gemarkeerd", () => {
    ok(evaluateRules(input(), [], cfg, lst).status);
    const v = evaluateRules(vinted(), [], cfg, lst);
    expect(v.flags).toContain("countryUnknown");
    expect(v.notes.join(" ")).toContain("Vinted toont dit niet");
    expect(evaluateRules(vinted(), [], { ...cfg, country: { ...cfg.country, unknownPolicy: "exclude" } }, lst)).toMatchObject({ status: "reject", decidedBy: "country" });
  });
  it("kopersbescherming en elektronicaverificatie worden afzonderlijk gecontroleerd", () => {
    const req = { ...cfg, protection: { requireBuyerProtection: true, requireElectronicsVerification: true, unknownPolicy: "mark" as const } };
    expect(evaluateRules(vinted({ buyerProtection: true, electronicsVerification: false }), [], req, lst)).toMatchObject({ status: "reject", decidedBy: "protection" });
    expect(evaluateRules(vinted({ buyerProtection: false, electronicsVerification: true }), [], req, lst).reasons[0]).toContain("Kopersbescherming");
    const both = evaluateRules(vinted({ buyerProtection: true, electronicsVerification: true }), [], req, lst);
    ok(both.status);
    const unknown = evaluateRules(vinted({ buyerProtection: true, electronicsVerification: null }), [], req, lst);
    expect(unknown.flags).toContain("verificationUnknown");
    expect(evaluateRules(vinted({ buyerProtection: null, electronicsVerification: null }), [], { ...req, protection: { ...req.protection, unknownPolicy: "exclude" } }, lst)).toMatchObject({ status: "reject", decidedBy: "protection" });
  });
  it("beschermingseisen gelden niet voor Marktplaats", () => ok(evaluateRules(input(), [], { ...cfg, protection: { requireBuyerProtection: true, requireElectronicsVerification: true, unknownPolicy: "exclude" } }, lst).status));
  it("verkopersbeoordeling: te laag → uitgesloten, onbekend → standaard tonen", () => {
    const sc = { ...cfg, sellerFilter: { minRating: 4.5, minReviews: 10, unknownPolicy: "show" as const } };
    expect(evaluateRules(input({ seller: { ageMonths: null, reviews: 20, rating: 3.9, verified: null } }), [], sc, lst)).toMatchObject({ status: "reject", decidedBy: "seller-filter" });
    expect(evaluateRules(input({ seller: { ageMonths: null, reviews: 3, rating: 4.9, verified: null } }), [], sc, lst)).toMatchObject({ status: "reject", decidedBy: "seller-filter" });
    ok(evaluateRules(input({ seller: { ageMonths: null, reviews: null, rating: null, verified: null } }), [], sc, lst).status);
  });
});

describe("meldingsvoorkeuren", () => {
  const facts = { score: 80, band: "TOP", netProfitCents: 20000, profileId: "p1", source: "vinted", modelKey: "iphone-15-pro", marginEuro: 120 };
  it("per platform, per model en op marge", () => {
    expect(passesPrefs(notifyPrefsSchema.parse({}), facts).ok).toBe(true);
    expect(passesPrefs(notifyPrefsSchema.parse({ platforms: ["marktplaats"] }), facts).ok).toBe(false);
    expect(passesPrefs(notifyPrefsSchema.parse({ platforms: ["vinted"] }), facts).ok).toBe(true);
    expect(passesPrefs(notifyPrefsSchema.parse({ modelKeys: ["iphone-14"] }), facts).ok).toBe(false);
    expect(passesPrefs(notifyPrefsSchema.parse({ modelKeys: ["iphone-15-pro"] }), facts).ok).toBe(true);
    expect(passesPrefs(notifyPrefsSchema.parse({ minMarginEuro: 150 }), facts).ok).toBe(false);
    expect(passesPrefs(notifyPrefsSchema.parse({ minMarginEuro: 100 }), facts).ok).toBe(true);
    expect(passesPrefs(notifyPrefsSchema.parse({ minMarginEuro: 150 }), { ...facts, marginEuro: null }).ok).toBe(true);
  });
});
