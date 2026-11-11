import type { RulesConfig } from "./config";
import { MARGIN_ROWS, MARGIN_ROWS_TWAN, type MarginRow } from "./tables";

export function marginRow(sellEuro: number, table: "A" | "B" | "TWAN" = "A"): MarginRow {
  const rows = table === "TWAN" ? MARGIN_ROWS_TWAN : MARGIN_ROWS;
  let row = rows[0];
  for (const r of rows) if (sellEuro >= r[0]) row = r;
  return row;
}

export interface AllowedPrices {
  askMargin: number;
  bidMargin: number;
  askHigh: number;
  bidHigh: number;
  allowedAsk: number;
  allowedBid: number;
  highAsk: number;
  highBid: number;
}

/** Toegestane vraag-/bieden-vanaf-prijs en de grens voor hoge marge, vanuit de maximale verkoopprijs. */
export function allowedPrices(maxSellEuro: number, cfg: Pick<RulesConfig, "marginTable" | "highMarginBidMode">, offsetEuro = 0): AllowedPrices {
  const row = marginRow(maxSellEuro, cfg.marginTable);
  const askMargin = (cfg.marginTable === "B" ? row[2] : row[1]) + offsetEuro;
  const bidMargin = row[4] + offsetEuro;
  const askHigh = row[3];
  const bidHigh = cfg.highMarginBidMode === "same" ? row[3] : row[5];
  const allowedAsk = maxSellEuro - askMargin;
  const allowedBid = maxSellEuro - bidMargin;
  return { askMargin, bidMargin, askHigh, bidHigh, allowedAsk, allowedBid, highAsk: allowedAsk - askHigh, highBid: allowedBid - bidHigh };
}

/** Bedrag (euro) dat de margeknop bij de vereiste marge optelt voor dit platform. */
export function marginOffsetEuro(cfg: RulesConfig, platform: string): number {
  const preset = cfg.dynamic.presets[platform === "vinted" ? "vinted" : "marktplaats"];
  return cfg.dynamic.offsetsEuro[preset];
}
