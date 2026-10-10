import { describe, expect, it } from "vitest";
import { extractExternalId, ParseError, parseListingHtml, parsePriceToCents } from "@/lib/sources/listing-parser";
import { parseCsv, parseFeed } from "@/lib/sources/feed-parser";
import { buildDealMessage } from "@/lib/notify/message";
import { sendDiscord, sendTelegram } from "@/lib/notify/senders";

const LD = `<html><head><title>x</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"iPhone 15 Pro 256GB zwart","description":"Batterij 91%. iCloud vrij.","image":["https://img.example/a.jpg","https://img.example/b.jpg"],"sku":"m2123456789","offers":{"@type":"Offer","price":"350.00","priceCurrency":"EUR","itemCondition":"https://schema.org/UsedCondition","url":"https://www.marktplaats.nl/v/telecommunicatie/mobiele-telefoons-apple-iphone/m2123456789-iphone-15-pro"}}</script></head><body></body></html>`;

const STATE = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { listing: { itemId: "m987654321", title: "MacBook Air M2 16GB", description: "Als nieuw", priceInfo: { priceCents: 85000, priceType: "FIXED" }, location: { cityName: "Utrecht", distanceMeters: 34000 }, date: "2026-10-09T10:00:00Z", imageUrls: ["//img.example/x.jpg"], attributes: [{ key: "Opslagcapaciteit", value: "512 GB" }], vipUrl: "/v/computers/m987654321-macbook" } } } })}</script></body></html>`;

const OG = `<html><head><meta property="og:title" content="iPad Pro 11 &amp; pencil"><meta property="og:description" content="Mooie iPad"><meta property="og:image" content="https://img.example/o.jpg"><meta property="product:price:amount" content="1.250,00"></head></html>`;

describe("advertentie-parser", () => {
  it("leest JSON-LD (schema.org Product)", () => {
    const ad = parseListingHtml(LD, "https://www.marktplaats.nl/v/telecommunicatie/m2123456789-iphone-15-pro");
    expect(ad.externalId).toBe("m2123456789");
    expect(ad.title).toBe("iPhone 15 Pro 256GB zwart");
    expect(ad.askingCents).toBe(35000);
    expect(ad.imageUrls).toHaveLength(2);
    expect(ad.conditionText).toBe("UsedCondition");
  });
  it("leest ingebedde state-JSON", () => {
    const ad = parseListingHtml(STATE, "https://www.marktplaats.nl/v/computers/m987654321-macbook");
    expect(ad).toMatchObject({ externalId: "m987654321", title: "MacBook Air M2 16GB", askingCents: 85000, location: "Utrecht", distanceKm: 34 });
    expect(ad.imageUrls[0]).toBe("https://img.example/x.jpg");
    expect(ad.attributes).toMatchObject({ Opslagcapaciteit: "512 GB" });
    expect(ad.publishedAt?.toISOString()).toBe("2026-10-09T10:00:00.000Z");
    expect(ad.url).toBe("https://www.marktplaats.nl/v/computers/m987654321-macbook");
  });
  it("valt terug op OpenGraph en haalt id uit de URL", () => {
    const ad = parseListingHtml(OG, "https://www.marktplaats.nl/v/x/m111222333-ipad");
    expect(ad.title).toBe("iPad Pro 11 & pencil");
    expect(ad.askingCents).toBe(125000);
    expect(ad.externalId).toBe("m111222333");
  });
  it("faalt duidelijk bij onleesbare pagina's of ontbrekend id", () => {
    expect(() => parseListingHtml("<html><body>Hallo</body></html>", "https://www.marktplaats.nl/x")).toThrow(ParseError);
    expect(() => parseListingHtml(OG, "https://www.marktplaats.nl/zonder-id")).toThrow(/ID/);
  });
  it("prijsparser en id-extractie", () => {
    expect(parsePriceToCents("€ 1.250,00")).toBe(125000);
    expect(parsePriceToCents("350")).toBe(35000);
    expect(parsePriceToCents("1.250")).toBe(125000);
    expect(parsePriceToCents(299.5)).toBe(29950);
    expect(parsePriceToCents("op aanvraag")).toBeNull();
    expect(extractExternalId("https://www.marktplaats.nl/v/a/b/m2123456789-iphone")).toBe("m2123456789");
    expect(extractExternalId("https://www.marktplaats.nl/a/b")).toBeNull();
  });
});

describe("feed-/bestandsimport", () => {
  it("parseert CSV met puntkomma, quotes en Nederlandse prijzen", () => {
    const csv = `id;titel;prijs;url;plaats;omschrijving;fotos\nA1;"iPhone 14, 128GB";€ 450,00;https://x.example/a1;Utrecht;"Mooi ""zgan"" toestel";https://i.example/1.jpg|https://i.example/2.jpg\nA2;iPad;300;https://x.example/a2;Breda;;`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].titel).toBe("iPhone 14, 128GB");
    const { ads, errors } = parseFeed(csv);
    expect(errors).toHaveLength(0);
    expect(ads[0]).toMatchObject({ externalId: "a1", askingCents: 45000, location: "Utrecht" });
    expect(ads[0].description).toBe('Mooi "zgan" toestel');
    expect(ads[0].imageUrls).toHaveLength(2);
  });
  it("parseert JSON en meldt foute rijen per rij", () => {
    const json = JSON.stringify({ items: [{ id: 1, title: "iPhone", price: 100, url: "https://x.example/1" }, { id: 2, title: "", url: "https://x.example/2" }, { id: 3, title: "x", url: "javascript:alert(1)" }] });
    const { ads, errors } = parseFeed(json);
    expect(ads).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([2, 3]);
  });
  it("weigert ongeldige invoer", () => {
    expect(() => parseFeed("{kapot")).toThrow();
    expect(() => parseFeed('{"x":1}')).toThrow(/lijst/);
  });
});

describe("Telegram-/Discord-berichten", () => {
  const input = { title: "t", modelLabel: "iPhone 15 Pro", storageGb: 256, askingCents: 35000, expectedCents: 52500, netProfitCents: 15000, maxBidCents: 40000, roiPct: 42.857, score: 93, band: "TOP" as const, batteryHealth: 91, distanceKm: 34, riskLevel: "MEDIUM" as const, activationLock: null, uncertain: false, url: "https://www.marktplaats.nl/v/x/m1-a" };
  it("volgt het voorbeeldformaat", () => {
    const { text } = buildDealMessage(input);
    expect(text).toContain("🔥 TOPDEAL GEVONDEN");
    expect(text).toContain("iPhone 15 Pro — 256GB");
    expect(text).toMatch(/Vraagprijs: €\s?350/);
    expect(text).toMatch(/Marktwaarde: €\s?525/);
    expect(text).toMatch(/Verwachte winst: €\s?150 \(43% rendement\)/);
    expect(text).toContain("Deal-score: 93/100");
    expect(text).toContain("Batterij: 91% volgens verkoper");
    expect(text).toContain("Afstand: 34 km");
    expect(text).toContain("Risico: Gemiddeld");
    expect(text).toContain("iCloud-status: Niet gecontroleerd");
    expect(text).toContain("https://www.marktplaats.nl/v/x/m1-a");
  });
  it("escapet HTML en markeert onzekere waarde", () => {
    const { html } = buildDealMessage({ ...input, modelLabel: "<b>x</b> & y", uncertain: true });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(html).toContain("onzeker");
  });
  it("verstuurt naar Telegram met de juiste payload en lekt het token niet in fouten", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";
    await sendTelegram({ token, chatId: "42", html: "<b>hoi</b>", url: "https://www.marktplaats.nl/x", fetchImpl: ok });
    expect(calls[0].url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(calls[0].body).toMatchObject({ chat_id: "42", parse_mode: "HTML" });
    const bad = (async () => new Response('{"description":"Forbidden"}', { status: 403 })) as unknown as typeof fetch;
    const err = await sendTelegram({ token, chatId: "42", html: "x", fetchImpl: bad }).catch((e) => e);
    expect(err.message).toContain("403");
    expect(err.message).not.toContain("ABCDEFGHIJ");
    expect(err.retryable).toBe(false);
    const down = (async () => { throw new Error(`connect failed bot${token}`); }) as unknown as typeof fetch;
    const e2 = await sendTelegram({ token, chatId: "42", html: "x", fetchImpl: down }).catch((e) => e);
    expect(e2.retryable).toBe(true);
    expect(e2.message).not.toContain("ABCDEFGHIJ");
    await expect(sendTelegram({ token: "kapot", chatId: "1", html: "x", fetchImpl: ok })).rejects.toThrow(/token/i);
  });
  it("valideert Discord-webhook-URL", async () => {
    const f = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(sendDiscord({ webhookUrl: "https://evil.example/api/webhooks/1/a", text: "x", fetchImpl: f })).rejects.toThrow(/webhook/i);
    await expect(sendDiscord({ webhookUrl: "https://discord.com/api/webhooks/123/abc-DEF", text: "x", fetchImpl: f })).resolves.toBeUndefined();
  });
});
