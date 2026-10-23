import { describe, expect, it } from "vitest";
import { scratchFactor } from "@/lib/rules/battery";
import { formatDigest, releaseWarning } from "@/lib/rules/digest";

const cfg = { enabled: true, decayPerMonthPct: 1.5, minPct: 50 };
const now = new Date("2026-10-23T00:00:00Z");

describe("scratchFactor", () => {
  it("is 1 als schalen uit staat of het model onbekend is", () => {
    expect(scratchFactor("iphone-13", now, { ...cfg, enabled: false })).toBe(1);
    expect(scratchFactor("onbekend", now, cfg)).toBe(1);
  });
  it("geeft nieuwere modellen een hogere factor dan oudere, met ondergrens", () => {
    const n = scratchFactor("iphone-17-pro", now, cfg);
    const o = scratchFactor("iphone-13", now, cfg);
    expect(n).toBeGreaterThan(o);
    expect(scratchFactor("iphone-11", now, cfg)).toBe(0.5);
  });
});

describe("releaseWarning", () => {
  it("waarschuwt van juli tot oktober, daarbuiten niet", () => {
    expect(releaseWarning(new Date("2026-07-02T00:00:00Z"), 7)).toContain("september");
    expect(releaseWarning(new Date("2026-03-02T00:00:00Z"), 7)).toBeNull();
    expect(releaseWarning(new Date("2026-12-02T00:00:00Z"), 7)).toBeNull();
    expect(releaseWarning(new Date("2026-07-02T00:00:00Z"), 0)).toBeNull();
  });
});

describe("formatDigest", () => {
  it("toont verschillen met de vorige periode", () => {
    const row = { modelKey: "iphone-13-pro-max", label: "iPhone 13 Pro Max", received: 187, withPrice: 167, bidZero: 20, avgAsk: 350, avgBid: 220, prev: { received: 172, withPrice: 157, bidZero: 10, avgAsk: 360, avgBid: 240 }, battery: { "<80": 0, "80-84": 0, "85-89": 0, "90-94": 0, "95-100": 0, onbekend: 0 } };
    const t = formatDigest([row], 14);
    expect(t).toContain("187 (+15) ontvangen");
    expect(t).toContain("vraag gem. €350 (-10)");
  });
});
