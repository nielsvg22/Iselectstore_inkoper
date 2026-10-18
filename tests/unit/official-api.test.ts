import { describe, expect, it, vi } from "vitest";
import { officialSearch, parseOfficialResults } from "@/lib/sources/marktplaats-official";
import { planSmartUnits, smartPageBudget } from "@/lib/sources/smart-plan";

const example = { _embedded: { "mp:search-result": [{
  itemId: "m459", title: "iPhone 16 Pro", description: "Ophalen", priceModel: { modelType: "fixed", askingPrice: 42000 },
  seller: { sellerId: 231, sellerName: "Voorbeeld uit contracttest" },
  _links: { "mp:advertisement-website-link": { href: "https://evil.example/" } },
}] } };

describe("documented official Search API contract (fixture, not live access)", () => {
  it("maps euro cents and canonical ids without inventing reputation, shipping or dates", () => {
    const [ad] = parseOfficialResults(example);
    expect(ad.askingCents).toBe(42000);
    expect(ad.url).toBe("https://link.marktplaats.nl/m459");
    expect(ad.seller).toEqual({ id: "231", name: "Voorbeeld uit contracttest" });
    expect(ad.distanceKm).toBeUndefined(); expect(ad.publishedAt).toBeUndefined();
    expect(ad.shipping).toBeUndefined(); expect(ad.seller?.rating).toBeUndefined();
    expect(ad.seller?.accountAgeMonths).toBeUndefined(); expect(ad.imageUrls).toEqual([]);
  });
  it("supports documented locale translations and skips malformed records", () => {
    const ads = parseOfficialResults({ _embedded: { "mp:search-result": [
      { itemId: "m2", translations: [{ locale: "nl-NL", title: "iPad" }] },
      { itemId: "https://evil.example", title: "bad" }, { itemId: "m3" },
      { itemId: "m4", title: "bad price", priceModel: { askingPrice: -1 } },
    ] } });
    expect(ads).toHaveLength(1); expect(ads[0].title).toBe("iPad");
    expect(() => parseOfficialResults({ results: [] })).toThrow(/formaat/);
  });
  it("sends only GET to documented host with bearer header, no redirects/date-sort or token in URL", async () => {
    const fetcher = vi.fn(async () => Response.json(example));
    await officialSearch("test-only-token", "(iphone) or (ipad)", 999, fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).origin).toBe("https://api.marktplaats.nl");
    expect(new URL(url).pathname).toBe("/v2/search");
    expect(new URL(url).searchParams.get("limit")).toBe("200");
    expect(new URL(url).searchParams.get("searchDescription")).toBe("true");
    expect(url).not.toContain("test-only-token"); expect(url).not.toContain("sortBy");
    expect(init.method).toBe("GET"); expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-only-token" });
  });
  it.each([401, 403, 429, 500])("sanitises HTTP %i, does not retry inline", async status => {
    const fetcher = vi.fn(async () => new Response("sensitive-provider-response", { status }));
    await expect(officialSearch("test-only-token", "iphone", 1, fetcher)).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
    try { await officialSearch("test-only-token", "iphone", 1, fetcher); }
    catch (e) { expect(String(e)).not.toMatch(/sensitive-provider-response|test-only-token/); }
  });
  it("parses Retry-After without inline sleeps", async () => {
    await expect(officialSearch("t", "iphone", 1, async () => new Response("", { status: 429, headers: { "retry-after": "120" } })))
      .rejects.toMatchObject({ status: 429, retryAfterMs: 120000 });
  });
  it("bounds the response and hides errors returned by the network", async () => {
    await expect(officialSearch("private", "iphone", 1, async () => { throw new Error("private"); })).rejects.toThrow("netwerkfout");
    await expect(officialSearch("t", "iphone", 1, async () => new Response("x".repeat(4_000_001)))).rejects.toThrow("te groot");
    await expect(officialSearch("t", "iphone", 1, async () => new Response("not json"))).rejects.toThrow("ongeldige JSON");
  });
});

describe("fair discovery planning within existing limits", () => {
  const queries = ["iphone", "macbook", "ipad", "apple watch", "airpods"];
  it("uses capacity at 12 rpm and keeps a slot for details", () => {
    expect(smartPageBudget(30, 12, 3, 12)).toBe(5);
    expect(smartPageBudget(30, 6, 3, 12)).toBe(2);
    expect(smartPageBudget(30, 30, 20, 12)).toBe(1);
  });
  it("all families get a turn with many model slices and a low page budget", () => {
    const state: Record<string, { at: string }> = {};
    const seen = new Set<string>();
    const slices = Array.from({ length: 100 }, (_, i) => ({ url: `https://www.marktplaats.nl/l/model-${i}/`, label: String(i) }));
    for (let round = 0; round < 8; round++) {
      const units = planSmartUnits(queries, slices, state, 2);
      expect(units[0].query).toBe("iphone"); expect(units.length).toBeLessThanOrEqual(2);
      for (const u of units) { state[u.key] = { at: new Date(1000 + round * 30000).toISOString() }; if (u.query) seen.add(u.query); }
    }
    expect([...seen].sort()).toEqual([...queries].sort());
  });
  it("checks all families within two rounds at 12 rpm, with model coverage", () => {
    const state: Record<string, { at: string }> = {};
    const seen = new Set<string>();
    for (let round = 0; round < 2; round++) {
      const units = planSmartUnits(queries, [{ url: "model", label: "model" }], state, 5);
      for (const u of units) { state[u.key] = { at: new Date(1000 + round * 30000).toISOString() }; if (u.query) seen.add(u.query); }
    }
    expect(seen.size).toBe(5);
  });
  it("rotates broad families even when only one page fits", () => {
    const state = { "q:iphone": { at: new Date().toISOString() } };
    expect(planSmartUnits(queries, [], state, 1)[0].query).toBe("macbook");
  });
});
