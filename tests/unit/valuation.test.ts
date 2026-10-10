import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/schema";
import { valuate, type ValuationComparableInput } from "@/lib/engines/valuation";

const now = new Date("2026-10-10T12:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86400000);
const comp = (price: number, o: Partial<ValuationComparableInput> = {}): ValuationComparableInput => ({ modelKey: "iphone-15-pro", priceCents: price * 100, kind: "ASKING_CURRENT", storageGb: 256, observedAt: day(5), ...o });

describe("marktwaardebepaling", () => {
  it("geeft onzeker aan zonder data", () => {
    const v = valuate({ modelKey: "iphone-15-pro", storageGb: 256 }, [], defaultConfig, now);
    expect(v.uncertain).toBe(true);
    expect(v.expectedCents).toBe(0);
    expect(v.sampleSize).toBe(0);
  });

  it("rekent vraagprijzen om met de realisatiefactor en geeft low <= expected <= high", () => {
    const comps = [680, 700, 710, 720, 700, 690, 705, 715].map((p) => comp(p));
    const v = valuate({ modelKey: "iphone-15-pro", storageGb: 256, conditionGrade: "A" }, comps, defaultConfig, now);
    expect(v.sampleSize).toBe(8);
    expect(v.expectedCents).toBeGreaterThan(600 * 100);
    expect(v.expectedCents).toBeLessThan(700 * 100); // 0.92 * ~700 = ~644
    expect(v.lowCents).toBeLessThanOrEqual(v.expectedCents);
    expect(v.highCents).toBeGreaterThanOrEqual(v.expectedCents);
    expect(v.uncertain).toBe(false);
  });

  it("gerealiseerde verkoopprijzen wegen zwaarder dan vraagprijzen", () => {
    const asking = [800, 800, 800, 800, 800].map((p) => comp(p));
    const realized = [600, 600, 600].map((p) => comp(p, { kind: "REALIZED" }));
    const a = valuate({ modelKey: "iphone-15-pro", storageGb: 256, conditionGrade: "A" }, asking, defaultConfig, now);
    const mix = valuate({ modelKey: "iphone-15-pro", storageGb: 256, conditionGrade: "A" }, [...asking, ...realized], defaultConfig, now);
    expect(mix.expectedCents).toBeLessThan(a.expectedCents);
    expect(mix.realizedUsed).toBe(3);
  });

  it("verwijdert uitschieters", () => {
    const comps = [700, 705, 695, 710, 698, 702, 5000].map((p) => comp(p));
    const v = valuate({ modelKey: "iphone-15-pro", storageGb: 256, conditionGrade: "A" }, comps, defaultConfig, now);
    expect(v.expectedCents).toBeLessThan(800 * 100);
    expect(v.steps.join(" ")).toMatch(/uitschieter/);
  });

  it("past waarde aan voor lage batterijconditie", () => {
    const comps = [700, 705, 695, 710, 698, 702].map((p) => comp(p));
    const good = valuate({ modelKey: "iphone-15-pro", storageGb: 256, batteryHealth: 95, conditionGrade: "A" }, comps, defaultConfig, now);
    const bad = valuate({ modelKey: "iphone-15-pro", storageGb: 256, batteryHealth: 75, conditionGrade: "A" }, comps, defaultConfig, now);
    expect(bad.expectedCents).toBeLessThan(good.expectedCents);
  });

  it("negeert andere opslagvarianten bij voldoende exacte data en gebruikt ze (geschaald) anders", () => {
    const exact = [700, 705, 695, 710, 698, 702].map((p) => comp(p));
    const other = [600, 610, 605].map((p) => comp(p, { storageGb: 128 }));
    const v1 = valuate({ modelKey: "iphone-15-pro", storageGb: 256, conditionGrade: "A" }, [...exact, ...other], defaultConfig, now);
    expect(v1.tier).toBe("exact");
    expect(v1.sampleSize).toBe(6);
    const v2 = valuate({ modelKey: "iphone-15-pro", storageGb: 256, conditionGrade: "A" }, other, defaultConfig, now);
    expect(v2.tier).toBe("extended");
    expect(v2.uncertain).toBe(true);
    expect(v2.confidence).toBeLessThanOrEqual(0.35);
  });

  it("sluit het eigen item en verouderde data uit", () => {
    const comps = [comp(700, { sourceAdId: "self" }), comp(700, { observedAt: day(400) })];
    const v = valuate({ modelKey: "iphone-15-pro", storageGb: 256, excludeSourceAdId: "self" }, comps, defaultConfig, now);
    expect(v.sampleSize).toBe(0);
  });

  it("betrouwbaarheid stijgt met meer vergelijkingen en gerealiseerde prijzen", () => {
    const few = [700, 710].map((p) => comp(p));
    const many = Array.from({ length: 14 }, (_, i) => comp(695 + (i % 5) * 4, i < 4 ? { kind: "REALIZED" } : {}));
    const a = valuate({ modelKey: "iphone-15-pro", storageGb: 256 }, few, defaultConfig, now);
    const b = valuate({ modelKey: "iphone-15-pro", storageGb: 256 }, many, defaultConfig, now);
    expect(b.confidence).toBeGreaterThan(a.confidence);
    expect(b.uncertain).toBe(false);
  });
});
