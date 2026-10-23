import { describe, expect, it } from "vitest";
import { parseActiveSince, parseListingHtml, sellerFromHtml } from "@/lib/sources/listing-parser";

describe("verkoper uit de detailpagina", () => {
  it.each([["19 jaar", 228], ["1 jaar", 12], ["3 maanden", 3], ["1 maand", 1], ["2 weken", 0], ["45 dagen", 2], ["0 dagen", 0]])("%s → %i maanden", (t, m) => {
    expect(parseActiveSince(t)).toBe(m);
  });
  it("onbekende tekst geeft null", () => {
    expect(parseActiveSince("sinds gisteren")).toBeNull();
    expect(parseActiveSince(null)).toBeNull();
  });
  it("leest accountleeftijd, bedrijf en id uit de ingebedde pagina-JSON", () => {
    const html = `<script>x={"seller":{"id":7129875,"name":"PhoneDock","activeSinceDiff":"19 jaar","activeYears":19,"sellerType":"TRADER"}}</script>`;
    expect(sellerFromHtml(html)).toEqual({ id: "7129875", accountAgeMonths: 228, business: true });
    expect(sellerFromHtml(`{"seller":{"id":5555555,"activeSinceDiff":"0 dagen","sellerType":"PRIVATE"}}`)).toEqual({ id: "5555555", accountAgeMonths: 0, business: null });
    expect(sellerFromHtml("<html>geen verkoper</html>")).toBeNull();
  });
  it("komt mee in de geparseerde advertentie (zonder ander verkopersgegevens te overschrijven)", () => {
    const html = `<html><head><meta property="og:title" content="iPhone 13 Pro 128GB"/><meta property="og:url" content="https://www.marktplaats.nl/v/x/y/m2400000001-iphone"/><meta property="product:price:amount" content="249"/></head><body><script>d={"seller":{"id":4242424,"activeSinceDiff":"0 dagen"}}</script></body></html>`;
    const ad = parseListingHtml(html, "https://www.marktplaats.nl/v/x/y/m2400000001-iphone");
    expect(ad.seller?.accountAgeMonths).toBe(0);
    expect(ad.seller?.id).toBe("4242424");
  });
});
