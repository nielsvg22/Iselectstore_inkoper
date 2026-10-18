import { describe, expect, it } from "vitest";
import { recentSince, publicRecentUrl } from "@/lib/sources/recent-search";
import { parseSearchPage } from "@/lib/sources/marktplaats-search";

const now = Date.parse("2026-10-18T08:00:00Z");
describe("public recent discovery windows", () => {
  it("builds public text-attribute paths, including pagination, without a private API or hash", () => {
    expect(publicRecentUrl("https://www.marktplaats.nl/q/iphone/", now, 2)).toBe(`https://www.marktplaats.nl/q/iphone/ta/offeredSince/${now}/p/2/`);
    expect(publicRecentUrl("https://www.marktplaats.nl/l/computers/apple-ipads/q/ipad/p/3/", now, 1)).toBe(`https://www.marktplaats.nl/l/computers/apple-ipads/q/ipad/ta/offeredSince/${now}/`);
    expect(() => publicRecentUrl("https://www.marktplaats.nl/lrp/api/search", now, 1)).toThrow();
    expect(() => publicRecentUrl("https://evil.example/q/x/", now, 1)).toThrow();
    expect(() => publicRecentUrl("https://www.marktplaats.nl/q/x/", NaN, 1)).toThrow();
  });
  it("uses overlap, catches up after downtime and preserves an incomplete window", () => {
    expect(recentSince(now, 5)).toBe(now - 300000);
    expect(recentSince(now, 5, { at: new Date(now - 30000).toISOString() })).toBe(now - 300000);
    expect(recentSince(now, 5, { completeAt: new Date(now - 3600000).toISOString() })).toBe(now - 3690000);
    expect(recentSince(now, 5, { recentSinceMs: now - 600000, nextPage: 3 })).toBe(now - 600000);
    expect(recentSince(now, 5, { at: "invalid" })).toBe(now - 300000);
    expect(recentSince(now, 5, { at: new Date(now - 3 * 86400000).toISOString() })).toBe(now - 86400000);
  });
  it("reads an applied numeric window, while relative day labels remain coarse", () => {
    const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { searchRequestAndResponse: {
      listings: [], totalResultCount: 0, searchRequest: { attributesByKey: [{ attributeKey: "offeredSince", attributeValueKey: String(now) }] },
    } } } })}</script>`;
    expect(parseSearchPage(html).appliedSinceMs).toBe(now);
    expect(parseSearchPage(html.replace(String(now), "Vandaag")).appliedSinceMs).toBeNull();
  });
});
