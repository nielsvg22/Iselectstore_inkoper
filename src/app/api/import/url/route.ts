import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { ingestAd } from "@/lib/pipeline/ingest";
import { rateLimit } from "@/lib/security/ratelimit";
import { getConfig } from "@/lib/settings/store";
import { fetchListingUrl } from "@/lib/sources/adapters";

const schema = z.object({ urls: z.array(z.string().url().max(500)).min(1).max(10), watch: z.boolean().optional() });

export const POST = route(async (req, { user }) => {
  const { urls } = await readJson(req, schema);
  const cfg = await getConfig();
  if (!cfg.sources.allowed.includes("MANUAL_URL")) throw new HttpError(403, "URL-import is uitgeschakeld in de instellingen");
  const rl = rateLimit(`import-url:${user.id}`, 30, 10 * 60_000);
  if (!rl.ok) throw new HttpError(429, "Te veel imports; probeer het later opnieuw");
  const results: Array<{ url: string; ok: boolean; adId?: string; created?: boolean; error?: string }> = [];
  for (const url of urls) {
    try {
      const raw = await fetchListingUrl(url, { allowlist: cfg.sources.urlAllowlist, minSecondsBetween: cfg.limits.minSecondsBetweenRequests });
      const r = await ingestAd(raw, { origin: "MANUAL_URL" });
      results.push({ url, ok: true, adId: r.adId, created: r.created });
    } catch (e) {
      results.push({ url, ok: false, error: (e as Error).message });
    }
  }
  return { results };
});
