import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { getBasePrices, saveBasePrices } from "@/lib/rules/config";
import { clearRulesCache } from "@/lib/rules/apply";

export const GET = route(async () => ({ prices: await getBasePrices() }));

export const PUT = route(async (req, { user }) => {
  const body = await readJson(req, z.object({ prices: z.array(z.unknown()), reason: z.string().max(100).optional() }));
  const prices = await saveBasePrices(body.prices, user.id, body.reason ?? "handmatig");
  clearRulesCache();
  return { prices };
}, { admin: true });
