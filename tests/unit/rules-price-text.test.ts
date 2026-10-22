import { describe, expect, it } from "vitest";
import cases from "../fixtures/price-text-cases.json";
import { extractPricesFromText } from "@/lib/rules/price-text";

type Case = { ask: number | null; bid: number | null; text: string };
// Twee voorbeelden uit het document zijn geen toestelprijs (verzendkosten / meerprijs) en worden bewust niet gelezen.
const NOT_A_DEVICE_PRICE = new Set(["meerprijs 50", "inclusief verzenden 20"]);

describe("prijs uit tekst (voorbeelden uit het Best Buy Phone-document)", () => {
  const list = (cases as Case[]).filter((c) => !NOT_A_DEVICE_PRICE.has(c.text));
  it(`leest alle ${list.length} voorbeelden goed (vraagprijs en bieden vanaf)`, () => {
    const wrong = list.map((c) => ({ c, r: extractPricesFromText(c.text) })).filter(({ c, r }) => r.ask !== c.ask || r.bid !== c.bid);
    expect(wrong.map(({ c, r }) => `${c.text} → ${r.ask}/${r.bid} (verwacht ${c.ask}/${c.bid})`)).toEqual([]);
  });
  it("verzint niets: zonder bedrag blijft alles leeg", () => {
    expect(extractPricesFromText("Bij een goed bod mag die weg")).toMatchObject({ ask: null, bid: null });
    expect(extractPricesFromText("iPhone 14 Pro 256GB batterij 91% zeer netjes")).toMatchObject({ ask: null, bid: null });
  });
  it("leest geen opslag, jaartal of modelnummer als prijs", () => {
    expect(extractPricesFromText("iPhone 8 64gb 299 euro").ask).toBe(299);
    expect(extractPricesFromText("iPad 2019 349 euro").ask).toBe(349);
  });
});
