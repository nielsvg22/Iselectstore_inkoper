import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { loadSellerReputation } from "@/lib/radar/seller-gate";
import { resetDb } from "../helpers";

let n = 0;
async function ad(source: string, sellerId: string | null, signals: object, updatedAt: Date, verified: boolean | null = null) {
  n++;
  const a = await prisma.advertisement.create({ data: { source, origin: "SEARCH", externalId: `x-${n}`, url: `https://x.nl/${n}`, title: "iPhone 15", description: "", askingPriceCents: 50000, fingerprint: `fp-${n}`, status: "ANALYZED", sellerId, sellerSignals: signals, sellerVerified: verified } });
  await prisma.$executeRaw`UPDATE "Advertisement" SET "updatedAt" = ${updatedAt} WHERE id = ${a.id}`;
}

describe("geheugen van verkopers", () => {
  beforeEach(async () => { await resetDb(); });
  it("laatst bekende gegevens per verkoper, per platform", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    await ad("marktplaats", "s1", { rating: 4, reviewCount: 3, accountAgeMonths: 20 }, new Date("2026-09-01T00:00:00Z"), false);
    await ad("marktplaats", "s1", { rating: 4.8, reviewCount: 40, accountAgeMonths: 22 }, new Date("2026-11-01T00:00:00Z"), true); // nieuwer wint
    await ad("marktplaats", "s2", { rating: null, reviewCount: null, accountAgeMonths: null }, now);
    await ad("vinted", "s1", { rating: 2, reviewCount: 1 }, now); // ander platform
    await ad("marktplaats", null, { rating: 5, reviewCount: 99 }, now); // zonder verkoper-ID
    const rep = await loadSellerReputation("marktplaats", now);
    expect([...rep.keys()].sort()).toEqual(["s1", "s2"]);
    expect(rep.get("s1")).toMatchObject({ rating: 4.8, reviews: 40, verified: true });
    expect(rep.get("s2")).toMatchObject({ rating: null, reviews: null, ageMonths: null });
    expect((await loadSellerReputation("vinted", now)).get("s1")).toMatchObject({ rating: 2, reviews: 1 });
  });
  it("anonieme verkopers worden overgeslagen (ze delen één ID)", async () => {
    await ad("marktplaats", "1", { rating: null, reviewCount: null, anonymous: true }, new Date("2026-11-01T00:00:00Z"));
    await ad("marktplaats", "1", { rating: 2, reviewCount: 1, anonymous: true }, new Date("2026-11-02T00:00:00Z"));
    expect((await loadSellerReputation("marktplaats", new Date("2026-11-15T12:00:00Z"))).has("1")).toBe(false);
  });
  it("accountleeftijd loopt mee met de tijd sinds we de verkoper zagen", async () => {
    await ad("marktplaats", "s1", { accountAgeMonths: 22 }, new Date("2026-05-15T12:00:00Z")); // 6 maanden geleden
    const rep = await loadSellerReputation("marktplaats", new Date("2026-11-15T12:00:00Z"));
    expect(rep.get("s1")!.ageMonths).toBe(28); // 22 + 6
  });
  it("een nieuwere advertentie zonder gegevens wist een bekende waarde niet", async () => {
    await ad("marktplaats", "s1", { rating: 4.7, reviewCount: 25 }, new Date("2026-08-01T00:00:00Z"));
    await ad("marktplaats", "s1", { rating: null, reviewCount: null }, new Date("2026-11-01T00:00:00Z"));
    expect((await loadSellerReputation("marktplaats", new Date("2026-11-15T12:00:00Z"))).get("s1")).toMatchObject({ rating: 4.7, reviews: 25 });
  });
});
