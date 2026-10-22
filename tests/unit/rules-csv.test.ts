import { describe, expect, it } from "vitest";
import { parsePriceCsv } from "@/lib/rules/csv";

describe("prijslijst plakken", () => {
  it("leest model, opslag en prijs; herkent labels en sleutels", () => {
    const r = parsePriceCsv("iPhone 15 Pro;256;700\niphone-14-pro;128;€ 400,50\nmodel;opslag;prijs\niPad mini (7e generatie);256;550;inkoop");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { modelKey: "iphone-15-pro", storageGb: 256, variant: "", priceEuro: 700, kind: "sell" },
      { modelKey: "iphone-14-pro", storageGb: 128, variant: "", priceEuro: 400.5, kind: "sell" },
      { modelKey: "ipad-mini-7", storageGb: 256, variant: "", priceEuro: 550, kind: "buy" },
    ]);
  });
  it("meldt onbekende modellen en ontbrekende prijzen per regel", () => {
    const r = parsePriceCsv("Nokia 3310;64;50\niPhone 15;128;");
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
  });
});
