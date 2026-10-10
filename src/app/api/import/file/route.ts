import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { ingestAd } from "@/lib/pipeline/ingest";
import { getConfig } from "@/lib/settings/store";
import { parseFeed } from "@/lib/sources/feed-parser";

const schema = z.object({ content: z.string().min(2).max(5_000_000) });

/** Importeert een zelf aangeleverde export (JSON of CSV). */
export const POST = route(async (req) => {
  const { content } = await readJson(req, schema);
  const cfg = await getConfig();
  if (!cfg.sources.allowed.includes("IMPORT")) throw new HttpError(403, "Bestandsimport is uitgeschakeld in de instellingen");
  let parsed;
  try {
    parsed = parseFeed(content, cfg.limits.maxAdsPerRun * 10);
  } catch (e) {
    throw new HttpError(400, `Kon het bestand niet lezen: ${(e as Error).message}`);
  }
  let created = 0;
  let updated = 0;
  for (const raw of parsed.ads) {
    const r = await ingestAd(raw, { origin: "IMPORT" });
    if (r.created) created++;
    else updated++;
  }
  return { created, updated, errors: parsed.errors.slice(0, 50), total: parsed.ads.length + parsed.errors.length };
});
