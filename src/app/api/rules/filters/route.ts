import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { getFilters, parseFiltersText, saveFilters } from "@/lib/rules/filters";
import { clearRulesCache } from "@/lib/rules/apply";

export const GET = route(async () => ({ filters: await getFilters() }));

/** Slaat de hele lijst op; of leest eerst geplakte tekst in (`text`) en geeft herkende regels + niet herkende modellen terug zonder op te slaan (`preview`). */
export const PUT = route(async (req, { user }) => {
  const body = await readJson(req, z.object({ filters: z.array(z.unknown()), reason: z.string().max(100).optional() }));
  const filters = await saveFilters(body.filters, user.id, body.reason ?? "handmatig");
  clearRulesCache();
  return { filters };
}, { admin: true });

export const POST = route(async (req) => {
  const body = await readJson(req, z.object({ text: z.string().max(2_000_000) }));
  return parseFiltersText(body.text);
}, { admin: true });
