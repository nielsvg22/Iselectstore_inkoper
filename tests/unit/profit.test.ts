import { describe, expect, it } from "vitest";
import { calcProfit, effectiveVatBasis, maxBuyPrice, minSalePrice } from "@/lib/engines/profit";

const costs = { repairCents: 0, shippingCents: 2500, transportCents: 0, otherCents: 0, platformFeePct: 0, transactionFeePct: 0 };
const noTax = { vatMode: "none" as const, vatRatePct: 21, marginSchemeEligible: false };

describe("winstberekening", () => {
  it("reproduceert het voorbeeld uit de opdracht (42,9% rendement)", () => {
    const p = calcProfit(35000, 52500, costs, noTax);
    expect(p.netProfitCents).toBe(15000);
    expect(p.roiPct).toBeCloseTo(42.857, 2);
    expect(p.grossMarginPct).toBeCloseTo(33.33, 1);
    expect(p.netMarginPct).toBeCloseTo(28.57, 1);
  });

  it("neemt alle kostenposten mee", () => {
    const p = calcProfit(30000, 50000, { repairCents: 5000, shippingCents: 1000, transportCents: 2000, otherCents: 500, platformFeePct: 2, transactionFeePct: 1 }, noTax);
    // 50000 - 30000 - 5000 - 1000 - 2000 - 500 - 1000(2%) - 500(1%) = 10000
    expect(p.netProfitCents).toBe(10000);
    expect(p.lines.map((l) => l.label)).toContain("Reparatiekosten");
  });

  it("standaard btw: btw over volledige verkoopprijs", () => {
    const p = calcProfit(30000, 60500, { ...costs, shippingCents: 0 }, { vatMode: "standard", vatRatePct: 21, marginSchemeEligible: false });
    expect(p.vatCents).toBe(10500); // 60500 * 21/121
    expect(p.netProfitCents).toBe(60500 - 30000 - 10500);
  });

  it("margeregeling alleen indien de gebruiker bevestigt dat deze van toepassing is", () => {
    const t = { vatMode: "margin" as const, vatRatePct: 21, marginSchemeEligible: false };
    expect(effectiveVatBasis(t)).toBe("standard");
    expect(effectiveVatBasis({ ...t, marginSchemeEligible: true })).toBe("margin");
    const std = calcProfit(30000, 60500, { ...costs, shippingCents: 0 }, t);
    const marg = calcProfit(30000, 60500, { ...costs, shippingCents: 0 }, { ...t, marginSchemeEligible: true });
    expect(marg.vatCents).toBe(Math.round((30500 * 0.21) / 1.21));
    expect(marg.netProfitCents).toBeGreaterThan(std.netProfitCents);
  });

  it("margeregeling geeft geen negatieve btw bij verlies", () => {
    const p = calcProfit(50000, 40000, { ...costs, shippingCents: 0 }, { vatMode: "margin", vatRatePct: 21, marginSchemeEligible: true });
    expect(p.vatCents).toBe(0);
  });

  it("minimale verkoopprijs haalt precies de winstdoelstelling", () => {
    const t = { vatMode: "standard" as const, vatRatePct: 21, marginSchemeEligible: false };
    const c = { ...costs, platformFeePct: 3 };
    const min = minSalePrice(30000, c, t, 10000);
    expect(calcProfit(30000, min, c, t).netProfitCents).toBeGreaterThanOrEqual(10000);
    expect(calcProfit(30000, min - 1, c, t).netProfitCents).toBeLessThan(10000);
  });

  it("maximale inkoopprijs: €400-advertentie wordt pas interessant bij een lagere prijs", () => {
    // verwachte verkoop 52500, kosten 25, min winst 100, min rendement 25%
    const max = maxBuyPrice(52500, costs, noTax, 10000, 25);
    const at = calcProfit(max, 52500, costs, noTax);
    expect(at.netProfitCents).toBeGreaterThanOrEqual(10000);
    expect(at.roiPct).toBeGreaterThanOrEqual(25);
    const above = calcProfit(max + 1, 52500, costs, noTax);
    expect(above.netProfitCents < 10000 || above.roiPct < 25).toBe(true);
    // rendement is hier de bindende voorwaarde: (52500-2500-b)/b >= .25 => b <= 40000
    expect(max).toBe(40000);
  });

  it("maximale inkoop is 0 als de marge niet haalbaar is", () => {
    expect(maxBuyPrice(1000, costs, noTax, 10000, 25)).toBe(0);
  });
});
