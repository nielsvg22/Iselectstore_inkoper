import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { loadRules } from "@/lib/rules/apply";
import { evaluateRules } from "@/lib/rules/verdict";
import { extractPricesFromText } from "@/lib/rules/price-text";
import { modelByKey } from "@/lib/catalog/apple";

const schema = z.object({
  modelKey: z.string().min(1).max(80),
  storageGb: z.number().int().nullable().default(null),
  ramGb: z.number().int().nullable().default(null),
  chip: z.string().max(20).nullable().default(null),
  screenInch: z.number().nullable().default(null),
  connectivity: z.string().max(20).nullable().default(null),
  batteryPct: z.number().min(0).max(100).nullable().default(null),
  text: z.string().max(20000).default(""),
  mpCondition: z.string().max(40).nullable().default(null),
  priceType: z.string().max(20).nullable().default("FIXED"),
  askEuro: z.number().min(0).nullable().default(null),
  bidEuro: z.number().min(0).nullable().default(null),
  distanceKm: z.number().min(0).nullable().default(null),
  shippingOffered: z.boolean().default(false),
  seller: z.object({ ageMonths: z.number().nullable().default(null), reviews: z.number().nullable().default(null), rating: z.number().nullable().default(null), verified: z.boolean().nullable().default(null) }).default({}),
  directBuy: z.boolean().default(false),
});

/** Test een denkbeeldige advertentie tegen de huidige regels (niets wordt opgeslagen of gemeld). */
export const POST = route(async (req) => {
  const b = await readJson(req, schema);
  const { cfg, prices } = await loadRules(true);
  const model = modelByKey(b.modelKey);
  const family = model?.family ?? "iphone";
  let ask = b.askEuro;
  let bid = b.bidEuro;
  let fromText: ReturnType<typeof extractPricesFromText> | null = null;
  if ((ask == null || ask <= 0) && (bid == null || bid <= 0)) {
    fromText = extractPricesFromText(b.text);
    ask = fromText.ask;
    bid = fromText.bid;
  }
  const verdict = evaluateRules({ ...b, askEuro: ask, bidEuro: bid, modelLabel: model?.label ?? b.modelKey, family, latitude: null, longitude: null, now: new Date() }, prices, cfg);
  return { verdict, priceFromText: fromText };
});
