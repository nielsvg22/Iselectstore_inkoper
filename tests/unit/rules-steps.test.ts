import { describe, expect, it } from "vitest";
import { defaultRules, type BasePrice } from "@/lib/rules/config";
import { STEPS, traceSteps } from "@/lib/rules/steps";
import { evaluateRules, type VerdictInput } from "@/lib/rules/verdict";

const cfg = defaultRules();
const NOW = new Date("2026-10-22T10:00:00Z");
const PRICES: BasePrice[] = [{ modelKey: "iphone-14-pro", storageGb: 128, variant: "", priceEuro: 400, kind: "sell" }];
const input = (o: Partial<VerdictInput> = {}): VerdictInput => ({
  modelKey: "iphone-14-pro", modelLabel: "iPhone 14 Pro", family: "iphone", storageGb: 128, ramGb: null, chip: null, screenInch: null, connectivity: null,
  batteryPct: 90, text: "Krasvrij", mpCondition: null, priceType: "FIXED", askEuro: 200, bidEuro: null, latitude: null, longitude: null,
  distanceKm: 5, shippingOffered: true, seller: { ageMonths: 130, reviews: 5, rating: 4.9, verified: true }, directBuy: false, now: NOW, ...o,
});
const states = (v: ReturnType<typeof evaluateRules>) => Object.fromEntries(traceSteps(v, cfg).map((t) => [t.id, t.state]));

describe("beslisboom en spoor per advertentie", () => {
  it("elke stap heeft een uitleg met de huidige instellingen", () => {
    expect(STEPS.length).toBeGreaterThan(10);
    for (const s of STEPS) expect(s.rule(cfg).length).toBeGreaterThan(5);
    expect(STEPS.find((s) => s.id === "battery-min")!.rule({ ...cfg, battery: { ...cfg.battery, excludeBelowPct: 83 } })).toContain("83%");
    expect(STEPS.find((s) => s.id === "distance-pickup-only")!.rule({ ...cfg, distance: { ...cfg.distance, includeShipping: false, pickupMaxKm: 40 } })).toContain("40 km");
  });
  it("een afwijzing: die stap beslist, de stappen ervoor zijn doorlopen, de rest niet bereikt", () => {
    const v = evaluateRules(input({ batteryPct: 79 }), PRICES, cfg);
    const s = states(v);
    expect(v.decidedBy).toBe("battery-min");
    expect(s.intel).toBe("passed");
    expect(s["battery-min"]).toBe("decided");
    expect(s["price-too-high"]).toBe("not-reached");
    expect(traceSteps(v, cfg).find((t) => t.id === "battery-min")!.outcome).toMatch(/^Afgewezen: Batterij 79%/);
  });
  it("prijs te hoog beslist pas na de berekening", () => {
    const v = evaluateRules(input({ askEuro: 400 }), PRICES, cfg);
    expect(v.decidedBy).toBe("price-too-high");
    expect(states(v)["calc"]).toBe("passed");
    expect(states(v)["stock"]).toBe("not-reached");
  });
  it("voldoet of 💰: alles doorlopen", () => {
    const v = evaluateRules(input(), PRICES, cfg);
    expect(v.decidedBy).toBeNull();
    expect(Object.values(states(v)).every((x) => x === "passed")).toBe(true);
  });
  it("handmatig controleren door de verkoper: die stap beslist, het latere prijsoordeel is wel doorlopen", () => {
    const v = evaluateRules(input({ distanceKm: 120, askEuro: 100, seller: { ageMonths: null, reviews: null, rating: null, verified: null } }), PRICES, cfg);
    expect(v.status).toBe("review");
    expect(v.decidedBy).toBe("seller-shipping");
    expect(states(v)["price-too-high"]).toBe("passed");
  });
  it("zonder basisprijs geeft de regelmotor geen oordeel en stopt bij die stap", () => {
    const v = evaluateRules(input({ modelKey: "iphone-13", modelLabel: "iPhone 13" }), PRICES, cfg);
    expect(v.status).toBe("skip");
    expect(v.decidedBy).toBe("base-price");
    expect(states(v).calc).toBe("not-reached");
  });
});
