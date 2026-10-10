import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { recognizeByRules } from "@/lib/engines/recognition";
import { rateLimit } from "@/lib/security/ratelimit";
import { HttpError } from "@/lib/auth";
import { getConfig } from "@/lib/settings/store";
import { fetchListingUrl } from "@/lib/sources/adapters";

const schema = z.object({ url: z.string().url().max(500) });

/** Test of een URL daadwerkelijk kan worden opgehaald en uitgelezen — slaat niets op. */
export const POST = route(async (req, { user }) => {
  const { url } = await readJson(req, schema);
  if (!rateLimit(`src-test:${user.id}`, 20, 10 * 60_000).ok) throw new HttpError(429, "Te veel tests");
  const cfg = await getConfig();
  const started = Date.now();
  try {
    const ad = await fetchListingUrl(url, { allowlist: cfg.sources.urlAllowlist, minSecondsBetween: cfg.limits.minSecondsBetweenRequests });
    const rec = recognizeByRules({ title: ad.title, description: ad.description, structured: ad.attributes });
    return {
      ok: true,
      ms: Date.now() - started,
      extracted: {
        externalId: ad.externalId,
        title: ad.title,
        priceEuro: ad.askingCents != null ? ad.askingCents / 100 : null,
        location: ad.location,
        images: ad.imageUrls.length,
        descriptionChars: (ad.description ?? "").length,
        publishedAt: ad.publishedAt,
      },
      recognition: { model: rec.modelLabel, confidence: rec.confidence },
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: (e as Error).message };
  }
});
