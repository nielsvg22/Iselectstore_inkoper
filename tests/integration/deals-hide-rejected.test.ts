import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { listDeals } from "@/lib/queries";
import { resetDb } from "../helpers";

async function ad(n: string, costs: object) {
  const a = await prisma.advertisement.create({
    data: { source: "marktplaats", origin: "MANUAL_URL", externalId: `m-${n}`, url: `https://www.marktplaats.nl/v/x/m-${n}`, title: n, description: "", askingPriceCents: 50000, fingerprint: `fp-${n}`, status: "ANALYZED" },
  });
  await prisma.dealAnalysis.create({
    data: { adId: a.id, askingCents: 50000, lowCents: 0, expectedCents: 60000, highCents: 0, valuationConfidence: 0.8, sampleSize: 5, costs, netProfitCents: 10000, conservativeProfitCents: 0, optimisticProfitCents: 0, grossMarginPct: 0, netMarginPct: 0, roiPct: 20, minSalePriceCents: 0, maxBidCents: 0, score: 70, band: "INTERESTING", scoreBreakdown: {}, explanation: "", settingsSnapshot: {} },
  });
  return a;
}

describe("Deals-lijst verbergt wat de inkoopregels afwijzen", () => {
  beforeEach(async () => { await resetDb(); });
  it("afgewezen verborgen; goedgekeurd, controleren en zonder oordeel blijven staan", async () => {
    await ad("afgewezen", { rules: { status: "reject" } });
    await ad("voldoet", { rules: { status: "match" } });
    await ad("controleren", { rules: { status: "review" } });
    await ad("hoge-marge", { rules: { status: "high", flags: ["high"] } });
    await ad("zonder-oordeel", {});
    await ad("oordeel-leeg", { rules: null });
    const titles = async (showRejected?: boolean) => (await listDeals({ showRejected, limit: 50 })).rows.map((r) => r.ad.title).sort();
    expect(await titles()).toEqual(["controleren", "hoge-marge", "oordeel-leeg", "voldoet", "zonder-oordeel"]);
    expect(await titles(true)).toEqual(["afgewezen", "controleren", "hoge-marge", "oordeel-leeg", "voldoet", "zonder-oordeel"]);
  });
});
