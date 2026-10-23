import { describe, expect, it } from "vitest";
import { assumedBatteryPct, batteryAdjustEuro, batteryDeductionEuro, modelAgeMonths } from "@/lib/rules/battery";
import { assessBid } from "@/lib/rules/bid";
import { defaultRules, findBasePrice, type BasePrice } from "@/lib/rules/config";
import { allowedPrices } from "@/lib/rules/margin";
import { analyzeScratch } from "@/lib/rules/scratch";
import { shippingEligibility } from "@/lib/rules/shipping";
import { isNewestPro, minPriceEuro } from "@/lib/rules/release";
import { evaluateRules, type VerdictInput } from "@/lib/rules/verdict";

const cfg = defaultRules();
const NOW = new Date("2026-10-22T10:00:00Z");

describe("batterij", () => {
  it("volgt de tabel uit het document", () => {
    expect(batteryAdjustEuro(80)).toBe(-25);
    expect(batteryAdjustEuro(85)).toBe(0);
    expect(batteryAdjustEuro(90)).toBe(25);
    expect(batteryAdjustEuro(91)).toBe(32.5);
    expect(batteryAdjustEuro(95)).toBe(62.5);
    expect(batteryAdjustEuro(100)).toBe(100);
    expect(batteryDeductionEuro(100)).toBe(0);
    expect(batteryDeductionEuro(90)).toBe(75);
  });
  it("schat onbekende batterij op leeftijd van het model: 100% tot 6 maanden, daarna −1% per maand, minimaal 82%", () => {
    const b = cfg.battery;
    expect([2, 6, 9, 12, 18, 24, 30].map((m) => assumedBatteryPct(m, b))).toEqual([100, 100, 97, 94, 88, 82, 82]);
    expect(modelAgeMonths("iphone-15-pro", NOW)).toBe(37);
    expect(modelAgeMonths("onbekend-model", NOW)).toBeNull();
  });
});

describe("marge en toegestane prijzen", () => {
  it("rekent het voorbeeld uit de mail na (verkoopprijs 260)", () => {
    const a = allowedPrices(260, cfg);
    expect(a.allowedAsk).toBe(185); // 260 − 75
    expect(a.allowedBid).toBe(165); // 260 − 95
    expect(a.highAsk).toBe(155); // 185 − 30
    expect(a.highBid).toBe(135); // 165 − 30 (zelfde extra voor beide)
    expect(allowedPrices(260, { ...cfg, highMarginBidMode: "table" }).highBid).toBe(115); // 165 − 50
  });
  it("kiest de juiste prijsklasse op de grenzen", () => {
    expect(allowedPrices(49.99, cfg).askMargin).toBe(45);
    expect(allowedPrices(50, cfg).askMargin).toBe(50);
    expect(allowedPrices(1400, cfg).askMargin).toBe(270);
    expect(allowedPrices(5000, cfg).bidMargin).toBe(365);
    expect(allowedPrices(100, { ...cfg, marginTable: "B" }).askMargin).toBe(65);
  });
});

describe("kras", () => {
  const s = cfg.scratch;
  it.each([
    ["Zonder krassen, altijd in hoesje", "free"], ["Geen krasse", "free"], ["krasvrij", "free"], ["Krasloos en netjes", "free"], ["schadevrij toestel", "free"],
    ["Screenprotector heeft er vanaf dag één opgezeten", "free"], ["Nog folie op het scherm", "free"], ["Als nieuw", "free"], ["geen enkele kras", "free"],
    ["Met lichte krasjes op de achterkant", "scratched"], ["Geen krassen op het scherm, wel kleine krasjes onderaan", "scratched"], ["gekrast", "scratched"],
    ["iPhone 14 Pro 128GB zwart", "unknown"],
  ])("%s → %s", (text, state) => {
    expect(analyzeScratch(text, null, s).state).toBe(state);
  });
  it("conditie Nieuw telt als krasvrij, Gebruikt niet", () => {
    expect(analyzeScratch("iPhone", "Nieuw", s).state).toBe("free");
    expect(analyzeScratch("iPhone", "Gebruikt", s).state).toBe("unknown");
  });
});

describe("bieden vanaf: gelooflijk of door Marktplaats ingevuld", () => {
  it.each([
    [250, 150, 200], // 60% → gemiddelde
    [1200, 800, 1000], // 66,6% maar gat > 250
    [280, 168, 224],
    [450, 360, 360], // 80%: door de verkoper bedacht
    [450, 400, 400],
    [500, 400, 400], // groter bedrag, gat van 100 is nog realistisch
  ])("vraag %i, bieden %i → %i", (ask, bid, eff) => {
    expect(assessBid(ask, bid, cfg.bid).effectiveEuro).toBe(eff);
  });
});

describe("verzendfilter naar accountleeftijd", () => {
  const sh = cfg.shipping;
  const seller = (ageMonths: number | null, reviews: number | null, rating: number | null, verified: boolean | null = true) => ({ ageMonths, reviews, rating, verified });
  it("onder 2 jaar nooit", () => expect(shippingEligibility(seller(23, 100, 5), sh).status).toBe("never"));
  it("2–3 jaar: 30+ reviews, 5 sterren en ID", () => {
    expect(shippingEligibility(seller(30, 30, 5), sh).status).toBe("ok");
    expect(shippingEligibility(seller(30, 29, 5), sh).status).toBe("fail");
    expect(shippingEligibility(seller(30, 40, 5, false), sh).status).toBe("fail");
    expect(shippingEligibility(seller(30, 40, 4.5), sh).status).toBe("fail");
  });
  it("5–8 jaar: 8+ reviews en 4,5 sterren, ID niet nodig", () => expect(shippingEligibility(seller(70, 8, 4.5, null), sh).status).toBe("ok"));
  it("10+ jaar: 2+ reviews", () => expect(shippingEligibility(seller(130, 2, 4.5, null), sh).status).toBe("ok"));
  it("ontbrekende gegevens worden nooit verzonnen", () => {
    expect(shippingEligibility(seller(null, null, null), sh).status).toBe("unknown");
    expect(shippingEligibility(seller(70, null, 4.8), sh).status).toBe("unknown");
  });
});

describe("nieuwste Pro/Pro Max en minimumprijs", () => {
  it("herkent de nieuwste Pro-modellen", () => {
    expect(isNewestPro("iphone-17-pro", NOW, cfg.distance)).toBe(true);
    expect(isNewestPro("iphone-17-pro-max", NOW, cfg.distance)).toBe(true);
    expect(isNewestPro("iphone-17", NOW, cfg.distance)).toBe(false);
    expect(isNewestPro("iphone-16-pro", NOW, cfg.distance)).toBe(false);
    expect(isNewestPro("iphone-17-pro", new Date("2025-06-01T00:00:00Z"), cfg.distance)).toBe(false);
  });
  it("lagere minimumprijs voor oudere modellen", () => {
    expect(minPriceEuro("iphone-15", "iphone", cfg.minPrice)).toBe(70);
    expect(minPriceEuro("iphone-12", "iphone", cfg.minPrice)).toBe(50);
  });
});

const PRICES: BasePrice[] = [
  { modelKey: "iphone-14-pro", storageGb: 128, variant: "", priceEuro: 400, kind: "sell" },
  { modelKey: "iphone-14-pro", storageGb: 256, variant: "", priceEuro: 450, kind: "sell" },
  { modelKey: "ipad-air-m2", storageGb: 128, variant: "11", priceEuro: 550, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 128, variant: "13", priceEuro: 650, kind: "buy" },
];
const input = (o: Partial<VerdictInput> = {}): VerdictInput => ({
  modelKey: "iphone-14-pro", modelLabel: "iPhone 14 Pro", family: "iphone", storageGb: 128, ramGb: null, chip: null, screenInch: null, connectivity: null,
  batteryPct: 90, text: "Krasvrij, altijd in hoesje", mpCondition: null, priceType: "FIXED", askEuro: 200, bidEuro: null, latitude: null, longitude: null,
  distanceKm: 5, shippingOffered: true, seller: { ageMonths: 60, reviews: 20, rating: 4.9, verified: true }, directBuy: false, now: NOW, ...o,
});

describe("foto-oordeel over krassen", () => {
  it("telt alleen mee als de tekst niets over krassen zegt", () => {
    const unk = evaluateRules(input({ text: "iPhone 14 Pro 128GB", photoScratch: "free" }), PRICES, cfg);
    expect(unk.scratch).toEqual({ state: "free", evidence: "foto-analyse" });
    const txt = evaluateRules(input({ text: "met krasjes", photoScratch: "free" }), PRICES, cfg);
    expect(txt.scratch.state).toBe("scratched");
    expect(evaluateRules(input({ text: "iPhone 14 Pro 128GB", photoScratch: null }), PRICES, cfg).scratch.state).toBe("unknown");
  });
});

describe("totaaloordeel", () => {
  it("max verkoopprijs = basis − batterij − kras; toegestane vraagprijs = max − marge", () => {
    // 400 − 75 (90%) − 0 (krasvrij) = 325; +20 (dichtbij Apeldoorn niet bekend → geen coördinaten) ; − 5 km rijfilter? verkoper voldoet aan het verzendfilter → geen aftrek
    const v = evaluateRules(input({ distanceKm: 5, seller: { ageMonths: 130, reviews: 5, rating: 4.9, verified: true } }), PRICES, cfg);
    expect(v.maxSellEuro).toBe(325);
    expect(v.allowedAsk).toBe(325 - 80); // klasse 300–349: 80
    expect(v.status).toBe("high"); // 200 ≤ 245 − 35 en marge ≥ 80
    expect(v.flags).toContain("scratchFree");
  });
  it("krassen onbekend kost €50, met krassen €100", () => {
    const base = input({ text: "iPhone 14 Pro 128GB" });
    const a = evaluateRules(base, PRICES, { ...cfg, distance: { ...cfg.distance, perKmEnabled: false } });
    expect(a.lines.find((l) => l.label === "Krassen onbekend")?.euro).toBe(-50);
    const b = evaluateRules({ ...base, text: "met krasjes" }, PRICES, { ...cfg, distance: { ...cfg.distance, perKmEnabled: false } });
    expect(b.lines.find((l) => l.label === "Met krassen")?.euro).toBe(-100);
  });
  it("rijfilter: €1 per km als de verkoper niet aan het verzendfilter voldoet", () => {
    const v = evaluateRules(input({ distanceKm: 30, seller: { ageMonths: 6, reviews: 0, rating: null, verified: false } }), PRICES, cfg);
    expect(v.lines.some((l) => l.label.startsWith("Rijfilter") && l.euro === -30)).toBe(true);
  });
  it("te hoge prijs wordt afgewezen met reden", () => {
    const v = evaluateRules(input({ askEuro: 400 }), PRICES, cfg);
    expect(v.status).toBe("reject");
    expect(v.reasons[0]).toMatch(/hoger dan de toegestane vraagprijs/);
  });
  it("batterij onder 80% wordt nooit gekocht", () => {
    expect(evaluateRules(input({ batteryPct: 79 }), PRICES, cfg).status).toBe("reject");
  });
  it("onbekende batterij wordt geschat op leeftijd en gemarkeerd met ?", () => {
    const v = evaluateRules(input({ batteryPct: null }), PRICES, cfg);
    expect(v.battery).toMatchObject({ pct: 82, assumed: true });
    expect(v.flags).toContain("batteryAssumed");
  });
  it("opslag onbekend: gemiddelde basisprijs en markering", () => {
    const v = evaluateRules(input({ storageGb: null }), PRICES, cfg);
    expect(v.baseEuro).toBe(425);
    expect(v.flags).toContain("storageUnknown");
    expect(v.flags).not.toContain("high"); // nooit hoge marge als opslag onbekend
  });
  it("verder dan 50 km vereist verzending en een betrouwbare verkoper; verder dan 300 km nooit", () => {
    const far = (o: Partial<VerdictInput>) => evaluateRules(input({ distanceKm: 120, ...o }), PRICES, cfg);
    expect(far({ shippingOffered: false }).status).toBe("reject");
    expect(far({ seller: { ageMonths: 6, reviews: 50, rating: 5, verified: true } }).status).toBe("reject");
    expect(far({ seller: { ageMonths: null, reviews: null, rating: null, verified: null }, askEuro: 100 }).status).toBe("review");
    expect(far({ seller: { ageMonths: 130, reviews: 5, rating: 4.9, verified: true }, askEuro: 100 }).status).not.toBe("reject");
    expect(evaluateRules(input({ distanceKm: 301 }), PRICES, cfg).status).toBe("reject");
  });
  it("verzending meenemen uit: alleen binnen het ophaalgebied, ook bij een perfecte verkoper", () => {
    const off = { ...cfg, distance: { ...cfg.distance, includeShipping: false, pickupMaxKm: 40 } };
    const perfect = { ageMonths: 200, reviews: 500, rating: 5, verified: true };
    const at = (km: number | null, c = off) => evaluateRules(input({ distanceKm: km, seller: perfect, askEuro: 100 }), PRICES, c);
    expect(at(40).status).not.toBe("reject");
    expect(at(41).status).toBe("reject");
    expect(at(41).reasons[0]).toMatch(/buiten 40 km hemelsbreed \(verzending staat uit\)/);
    expect(at(120).status).toBe("reject");
    expect(at(null).status).toBe("review"); // afstand onbekend: niet bewezen, wel gemarkeerd
    // met verzending aan komt dezelfde verkoper op 120 km wel door
    expect(at(120, cfg).status).not.toBe("reject");
  });
  it("nieuwste Pro/Pro Max: nooit verder dan 50 km", () => {
    const p: BasePrice[] = [{ modelKey: "iphone-17-pro", storageGb: 256, variant: "", priceEuro: 900, kind: "sell" }];
    const v = evaluateRules(input({ modelKey: "iphone-17-pro", modelLabel: "iPhone 17 Pro", storageGb: 256, distanceKm: 80, seller: { ageMonths: 130, reviews: 9, rating: 5, verified: true } }), p, cfg);
    expect(v.status).toBe("reject");
    expect(v.reasons[0]).toMatch(/nieuwste Pro/);
  });
  it("minimumprijs filtert hoesjes", () => {
    expect(evaluateRules(input({ askEuro: 12 }), PRICES, cfg).status).toBe("reject");
  });
  it("vraagprijs en bieden vanaf: realistisch bod mag de deal redden", () => {
    const v = evaluateRules(input({ askEuro: 260, bidEuro: 215, text: "krasvrij", seller: { ageMonths: 130, reviews: 5, rating: 4.9, verified: true } }), PRICES, cfg);
    expect(v.priceKind).toBe("both");
    expect(v.status).not.toBe("reject");
  });
  it("bieden vanaf 0 zonder prijs: alleen interessant bij batterij 85+, krasvrij en betrouwbaar of dichtbij", () => {
    const zero = (o: Partial<VerdictInput>) => evaluateRules(input({ priceType: "MIN_BID", askEuro: null, bidEuro: 0, ...o }), PRICES, cfg);
    expect(zero({}).status).toBe("match");
    expect(zero({}).flags).toContain("bid0");
    expect(zero({ text: "iPhone 14 Pro" }).status).toBe("reject");
    expect(zero({ batteryPct: null }).status).toBe("reject");
    expect(zero({ distanceKm: 40, seller: { ageMonths: 3, reviews: 0, rating: null, verified: false } }).status).toBe("reject");
  });
  it("zonder basisprijs: terugvallen op de bestaande waardering (skip) of afwijzen", () => {
    expect(evaluateRules(input({ modelKey: "iphone-13", modelLabel: "iPhone 13" }), PRICES, cfg).status).toBe("skip");
    expect(evaluateRules(input({ modelKey: "iphone-13", modelLabel: "iPhone 13" }), PRICES, { ...cfg, unknownBase: "skip" }).status).toBe("reject");
  });
  it("Intel-Macs worden uitgesloten; MacBook Air buiten de ingestelde RAM/SSD ook", () => {
    expect(evaluateRules(input({ family: "macbook_air", modelKey: "macbook-air-intel-13", chip: "Intel", batteryPct: null }), PRICES, cfg).status).toBe("reject");
    expect(evaluateRules(input({ family: "macbook_air", modelKey: "macbook-air-m2-13", chip: "M2", ramGb: 4, batteryPct: null }), PRICES, cfg).status).toBe("reject");
  });
  it("iPad: maximale inkoopprijs (zonder marge) per schermmaat; cellular +€50", () => {
    const ip = (o: Partial<VerdictInput>) => evaluateRules(input({ family: "ipad", modelKey: "ipad-air-m2", modelLabel: "iPad Air M2", storageGb: 128, batteryPct: null, text: "", distanceKm: 0, ...o }), PRICES, { ...cfg, distance: { ...cfg.distance, perKmEnabled: false } });
    expect(ip({ screenInch: 11, askEuro: 540 }).allowedAsk).toBe(550);
    expect(ip({ screenInch: 13, askEuro: 540 }).allowedAsk).toBe(650);
    expect(ip({ screenInch: 11, connectivity: "Cellular", askEuro: 540 }).allowedAsk).toBe(600);
    expect(ip({ screenInch: 11, askEuro: 560 }).status).toBe("reject");
  });
  it("voorraadregel: bij volle voorraad alleen hoge marge", () => {
    const s = { ...cfg, stock: { ...cfg.stock, enabled: true, baseThreshold: 3 } };
    const v = evaluateRules(input({ askEuro: 230, stock: { count: 3, sold30d: 0 } }), PRICES, s);
    expect(v.status).toBe("reject");
    expect(v.reasons[0]).toMatch(/Voorraad/);
  });
  it("basisprijs zoeken: variant en opslag", () => {
    expect(findBasePrice(PRICES, "ipad-air-m2", 128, "13").price?.priceEuro).toBe(650);
    expect(findBasePrice(PRICES, "iphone-14-pro", 512).price).toBeNull();
    expect(findBasePrice(PRICES, "iphone-14-pro", null)).toMatchObject({ storageAssumed: true });
  });
});
