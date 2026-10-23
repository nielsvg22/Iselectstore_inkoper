import { describe, expect, it } from "vitest";
import { classifyCondition, evaluateFilters, matchFilterModel, parseFiltersText, type FilterAd, type SearchFilter } from "@/lib/rules/filters";
import { defaultRules, type BasePrice } from "@/lib/rules/config";
import { evaluateRules, type VerdictInput } from "@/lib/rules/verdict";

const f = (o: Partial<SearchFilter>): SearchFilter => ({ id: Math.random().toString(), modelKey: "iphone-13", variant: "", storageGb: 128, condition: "normal", minEuro: 50, maxEuro: 320, maxKm: 300, adType: "all", sellerType: "Alle", sellerMinMonths: 0, ...o });
const ad = (o: Partial<FilterAd> = {}): FilterAd => ({ modelKey: "iphone-13", variant: "", storageGb: 128, condition: "normal", priceKind: "ask", askEuro: 250, bidEuro: null, km: 20, sellerMonths: 60, ...o });

describe("modelnamen uit de lijst", () => {
  it("koppelt iPhone, iPad, Mac en Watch aan catalogussleutels", () => {
    expect(matchFilterModel("iPhone 13 Mini")).toEqual({ modelKey: "iphone-13-mini", variant: "" });
    expect(matchFilterModel("iPhone SE 2022")?.modelKey).toBe("iphone-se-3");
    expect(matchFilterModel("iPad Air 6 M2 11-inch (2024)")).toEqual({ modelKey: "ipad-air-m2", variant: "11" });
    expect(matchFilterModel("iPad Pro M5 13-inch (2025)")?.modelKey).toBe("ipad-pro-13-m5");
    expect(matchFilterModel("iPad Pro 12.9-inch (2021)")?.modelKey).toBe("ipad-pro-12_9-m1");
    expect(matchFilterModel("iPad 11 A16 (2025)")?.modelKey).toBe("ipad-11");
    expect(matchFilterModel("MacBook Air M5 15-inch")?.modelKey).toBe("macbook-air-m5-15");
    expect(matchFilterModel("Mac Mini M2 Pro")?.modelKey).toBe("mac-mini-m2-pro");
    expect(matchFilterModel("Apple Watch Ultra")?.modelKey).toBe("watch-ultra-1");
    expect(matchFilterModel("Nokia 3310")).toBeNull();
  });
});

describe("lijst inlezen", () => {
  it("leest kolommen, slaat koppen over en meldt onbekende modellen", () => {
    const r = parseFiltersText("Model\tOpslag\tConditie\tMinimale Prijs\tMaximale Prijs\tMaximale Afstand\tType Advertentie\tType Verkoper\tVerkoper Actief\nApple iPhone\niPhone 13\tAlle\tSealed\t70\t400\t300\tVraagprijs\tAlle\t0 maanden\tx\niPhone 13\t1TB\tKapot\t50\t200\t45\tAlle met prijs\tAlle\t1 maand\nNokia\t64GB\tNormaal\t1\t2\t3\tAlle\tAlle\t0 maanden");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ storageGb: null, condition: "sealed", maxEuro: 400, adType: "ask", sellerMinMonths: 0 });
    expect(r.rows[1]).toMatchObject({ storageGb: 1024, condition: "broken", maxKm: 45, adType: "withPrice", sellerMinMonths: 1 });
    expect(r.unmatched).toEqual(["Nokia"]);
  });
});

describe("conditie", () => {
  it("herkent kapot, sealed en normaal", () => {
    expect(classifyCondition("iPhone 13 defect scherm", "Gebruikt")).toBe("broken");
    expect(classifyCondition("Niet defect, werkt perfect", "Gebruikt")).toBe("normal");
    expect(classifyCondition("Nieuw in de folie, sealed", "Nieuw")).toBe("sealed");
    expect(classifyCondition("iPhone 13 mooi", "Nieuw")).toBe("sealed");
    expect(classifyCondition("iPhone 13 mooi", "Gebruikt")).toBe("normal");
  });
});

describe("zoekfilter toepassen", () => {
  const list = [f({ storageGb: 128, maxEuro: 320 }), f({ storageGb: 256, maxEuro: 360, minEuro: 70 }), f({ storageGb: null, condition: "sealed", maxEuro: 400, adType: "ask" })];
  it("past op model, opslag en conditie", () => {
    expect(evaluateFilters(list, ad())).toMatchObject({ status: "ok", filter: { storageGb: 128 } });
    expect(evaluateFilters(list, ad({ storageGb: 256, askEuro: 300 }))).toMatchObject({ status: "ok", filter: { maxEuro: 360 } });
    expect(evaluateFilters(list, ad({ condition: "sealed" }))).toMatchObject({ status: "ok", filter: { maxEuro: 400 } });
    expect(evaluateFilters(list, ad({ modelKey: "iphone-14" })).status).toBe("no-filters-for-model");
    expect(evaluateFilters(list, ad({ condition: "broken" }))).toMatchObject({ status: "fail" });
    expect(evaluateFilters(list, ad({ storageGb: 512 }))).toMatchObject({ status: "fail" });
  });
  it("wijst af op prijs, afstand, type advertentie en verkoper", () => {
    expect((evaluateFilters(list, ad({ askEuro: 330 })) as { reasons: string[] }).reasons[0]).toContain("hoger dan de zoekfilterprijs");
    expect((evaluateFilters(list, ad({ askEuro: 30 })) as { reasons: string[] }).reasons[0]).toContain("minimumprijs");
    expect(evaluateFilters(list, ad({ km: 400 })).status).toBe("fail");
    expect(evaluateFilters(list, ad({ condition: "sealed", priceKind: "bid", askEuro: null, bidEuro: 200 })).status).toBe("fail");
    const strict = [f({ sellerMinMonths: 12 })];
    expect(evaluateFilters(strict, ad({ sellerMonths: 3 })).status).toBe("fail");
    expect(evaluateFilters(strict, ad({ sellerMonths: null }))).toMatchObject({ status: "ok", sellerUnknown: true });
  });
  it("bij bieden accepteert een bod binnen de grens ook als de vraagprijs te hoog is", () => {
    expect(evaluateFilters(list, ad({ priceKind: "both", askEuro: 500, bidEuro: 300 })).status).toBe("ok");
  });
  it("onbekende opslag gebruikt het gemiddelde", () => {
    const r = evaluateFilters(list, ad({ storageGb: null, askEuro: 340 }));
    expect(r).toMatchObject({ status: "ok", storageAssumed: true, filter: { maxEuro: 340 } });
  });
});

describe("regelmotor met zoekfilters", () => {
  const cfg = { ...defaultRules(), priceBase: "buy85" as const, filters: { enabled: true, outsideList: "reject" as const } };
  const prices: BasePrice[] = [];
  const input = (o: Partial<VerdictInput> = {}): VerdictInput => ({
    modelKey: "iphone-13", modelLabel: "iPhone 13", family: "iphone", storageGb: 128, ramGb: null, chip: null, screenInch: null, connectivity: null,
    batteryPct: 90, text: "iPhone 13 128GB krasvrij", mpCondition: null, priceType: "FIXED", askEuro: 200, bidEuro: null, latitude: null, longitude: null,
    distanceKm: 5, shippingOffered: true, seller: { ageMonths: 60, reviews: 20, rating: 4.9, verified: true }, directBuy: false, now: new Date("2026-10-23T00:00:00Z"), ...o,
  });
  const list = [f({ maxEuro: 320, minEuro: 50 })];
  it("gebruikt de zoekfilterprijs als basis en wijst af buiten de lijst of de grens", () => {
    const ok = evaluateRules(input(), prices, cfg, list);
    expect(ok.status).not.toBe("reject");
    expect(ok.baseEuro).toBe(320);
    expect(ok.filter?.maxEuro).toBe(320);
    expect(evaluateRules(input({ askEuro: 340 }), prices, cfg, list)).toMatchObject({ status: "reject", decidedBy: "filter" });
    expect(evaluateRules(input({ modelKey: "iphone-14", modelLabel: "iPhone 14" }), prices, cfg, list)).toMatchObject({ status: "reject", decidedBy: "filter" });
    const ign = evaluateRules(input({ modelKey: "iphone-14", modelLabel: "iPhone 14" }), prices, { ...cfg, filters: { ...cfg.filters, outsideList: "ignore" } }, list);
    expect(ign.decidedBy).not.toBe("filter");
  });
  it("staat uit tenzij ingeschakeld", () => {
    const off = evaluateRules(input({ askEuro: 340 }), prices, { ...cfg, filters: { ...cfg.filters, enabled: false } }, list);
    expect(off.decidedBy).not.toBe("filter");
  });
});
