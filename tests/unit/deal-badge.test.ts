import { describe, expect, it } from "vitest";
import { dealBadge, discountPct } from "@/lib/deal-badge";

const base = { score: 50, blocked: false, askingCents: 70000, expectedCents: 90000, netProfitCents: 15000, ageMinutes: 120, topScore: 75 };

describe("dealbadge in de tabel", () => {
  it("berekent het verschil met de marktprijs (positief = onder marktprijs)", () => {
    expect(discountPct(64000, 89900)).toBe(29);
    expect(discountPct(100, 0)).toBeNull();
    expect(discountPct(0, 100)).toBeNull();
    expect(discountPct(120, 100)).toBe(-20);
  });
  it("Top deal vanaf de topscore", () => expect(dealBadge({ ...base, score: 80 })).toMatchObject({ label: "Top deal", tone: "success", icon: "thumb" }));
  it("Snel reageren: heel nieuw en winstgevend", () => expect(dealBadge({ ...base, ageMinutes: 12 })).toMatchObject({ label: "Snel reageren", tone: "warning" }));
  it("Onder marktprijs vanaf 15% korting", () => expect(dealBadge(base)).toMatchObject({ label: "Onder marktprijs", tone: "info" }));
  it("anders beoordelen; geblokkeerd wint altijd", () => {
    expect(dealBadge({ ...base, askingCents: 88000 }).label).toBe("Beoordelen");
    expect(dealBadge({ ...base, score: 99, blocked: true }).label).toBe("Geblokkeerd");
  });
});
