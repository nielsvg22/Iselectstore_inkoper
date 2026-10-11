import { describe, expect, it } from "vitest";
import { percentile, summarize } from "@/lib/metrics";
import { assessSeller } from "@/lib/engines/seller";
import { batteryOutcome, distanceCosts } from "@/lib/engines/policy";
import { defaultConfig, configSchema } from "@/lib/config/schema";
import { notifyPrefsSchema, passesPrefs, quietEndsAt } from "@/lib/notify/prefs";

describe("percentielen", () => {
  it("berekent p50 en p95", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([10], 95)).toBe(10);
    expect(percentile([], 50)).toBeNull();
    const s = summarize(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(Math.round(s.p95!)).toBe(95);
    expect(s.n).toBe(100);
  });
});

describe("verkopersbetrouwbaarheid", () => {
  const base = { photoCount: 4, descriptionLength: 200, askingCents: 40000, riskFlags: [], shipping: ["pickup"] };
  it("onbekende verkoper wordt nooit als betrouwbaar behandeld", () => {
    const r = assessSeller({ ...base, verified: null });
    expect(r.level).not.toBe("HIGH");
    expect(r.unknown).toEqual(expect.arrayContaining(["Beoordelingen", "Accountleeftijd", "Verkoopverleden"]));
    expect(r.signals.some((s) => s.provenance === "CONFIRMED" && s.effect > 0)).toBe(false);
  });
  it("alleen geverifieerd + gezonde advertentie kan HIGH worden en blijft herleidbaar", () => {
    const r = assessSeller({ ...base, verified: true, business: true });
    expect(r.level).toBe("HIGH");
    expect(r.signals.find((s) => s.code === "VERIFIED")?.provenance).toBe("CONFIRMED");
  });
  it("betaalrisico drukt de score en markeert als geschat", () => {
    const r = assessSeller({ ...base, verified: false, riskFlags: [{ code: "PREPAYMENT_REQUEST", label: "x", severity: "high", points: 40 }] });
    expect(r.level).toBe("LOW");
    expect(r.signals.find((s) => s.code === "PAYMENT_RISK")?.provenance).toBe("ESTIMATED");
  });
});

describe("beleid afstand en batterij", () => {
  const cfg = configSchema.parse({ policies: { distance: { pickupMaxKm: 45, transportPerKmCents: 25, shippingCostCents: 700 }, battery: { excludeBelowPct: 85, unknown: "review", deductReplacement: true, replacementCents: 9000, priceCorrectionPct: 5 } } });
  it("binnen 45 km: reiskosten; ver weg met verzending: verzendkosten; onbekend: niets", () => {
    expect(distanceCosts(30, ["pickup"], cfg)).toMatchObject({ mode: "near", transportCents: 1500, shippingCents: null });
    expect(distanceCosts(120, ["shipping"], cfg)).toMatchObject({ mode: "far_shipping", shippingCents: 700 });
    expect(distanceCosts(120, ["pickup"], cfg)).toMatchObject({ mode: "far_pickup_only", transportCents: 6000 });
    expect(distanceCosts(null, [], cfg)).toMatchObject({ mode: "unknown", transportCents: null, shippingCents: null });
  });
  it("batterijbeleid: uitsluiten, onbekend apart beoordelen, vervangingskosten en prijscorrectie", () => {
    expect(batteryOutcome("iphone", 80, cfg)).toMatchObject({ exclude: true, replacementCents: 9000, priceFactor: 0.95 });
    expect(batteryOutcome("iphone", null, cfg)).toMatchObject({ review: true, exclude: false });
    expect(batteryOutcome("iphone", 92, cfg)).toMatchObject({ exclude: false, replacementCents: 0, priceFactor: 1 });
    expect(batteryOutcome("airpods", null, cfg).review).toBe(false);
    expect(defaultConfig.policies.battery.unknown).toBe("allow");
  });
});

describe("meldingsvoorkeuren", () => {
  it("filtert op modus, winst, score en profiel", () => {
    const p = notifyPrefsSchema.parse({ mode: "top", minProfitEuro: 100, profileIds: ["a"] });
    expect(passesPrefs(p, { score: 95, band: "TOP", netProfitCents: 12000, profileId: "a" }).ok).toBe(true);
    expect(passesPrefs(p, { score: 80, band: "VERY_INTERESTING", netProfitCents: 12000, profileId: "a" }).ok).toBe(false);
    expect(passesPrefs(p, { score: 95, band: "TOP", netProfitCents: 5000, profileId: "a" }).ok).toBe(false);
    expect(passesPrefs(p, { score: 95, band: "TOP", netProfitCents: 12000, profileId: "b" }).ok).toBe(false);
  });
  it("stilteperiode over middernacht", () => {
    const p = notifyPrefsSchema.parse({ quiet: { enabled: true, start: "22:30", end: "07:00" } });
    const night = new Date("2026-01-15T22:00:00Z"); // 23:00 Amsterdam (winter)
    const end = quietEndsAt(p, night)!;
    expect(end).not.toBeNull();
    expect(end.toISOString()).toBe("2026-01-16T06:00:00.000Z"); // 07:00 Amsterdam
    expect(quietEndsAt(p, new Date("2026-01-15T12:00:00Z"))).toBeNull();
  });
});
