import { HttpError } from "@/lib/auth";
import { routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { ingestAd } from "@/lib/pipeline/ingest";
import { rateLimit } from "@/lib/security/ratelimit";
import { getConfig } from "@/lib/settings/store";
import { fetchListingUrl } from "@/lib/sources/adapters";
import { mergeDetail } from "@/lib/sources/marktplaats-search";
import { SourceError } from "@/lib/sources/types";

/**
 * Haalt de volledige detailpagina op (alle foto's + volledige tekst) voor één advertentie
 * en rekent de analyse direct opnieuw door. Zelfde beveiliging als URL-import (SSRF, robots.txt, vertraging).
 */
export const POST = routeP<{ id: string }>(async (_req, { params, user }) => {
  const ad = await prisma.advertisement.findUnique({ where: { id: params.id }, include: { images: { orderBy: { position: "asc" } } } });
  if (!ad) throw new HttpError(404, "Advertentie niet gevonden");
  if (ad.isDemo) throw new HttpError(400, "Voorbeelddata heeft geen detailpagina");
  if (!rateLimit(`refresh:${user.id}`, 40, 10 * 60_000).ok) throw new HttpError(429, "Te veel verversingen; probeer het later opnieuw");
  const cfg = await getConfig();
  let detail;
  try {
    detail = await fetchListingUrl(ad.url, { allowlist: cfg.sources.urlAllowlist, minSecondsBetween: cfg.limits.minSecondsBetweenRequests });
  } catch (e) {
    const msg = e instanceof SourceError ? e.message : (e as Error).message;
    await prisma.advertisement.update({ where: { id: ad.id }, data: { statusError: msg.slice(0, 300) } });
    return { ok: false, error: msg };
  }
  const stored = {
    externalId: ad.externalId,
    url: ad.url,
    title: ad.title,
    description: ad.description,
    askingCents: ad.askingPriceCents,
    location: ad.location,
    postalCode: ad.postalCode,
    distanceKm: ad.distanceKm,
    category: ad.category,
    sellerType: ad.sellerType,
    shipping: (ad.shippingOptions as string[]) ?? [],
    conditionText: ad.conditionText,
    publishedAt: ad.publishedAt,
    imageUrls: ad.images.map((i) => i.url),
    attributes: ((ad.rawPayload as { attributes?: Record<string, string | number> } | null)?.attributes ?? {}) as Record<string, string | number>,
  };
  const merged = mergeDetail(stored, { ...detail, externalId: ad.externalId });
  // Zoekresultaten bevatten de actuele prijs al; de detailpagina vult alleen aan
  const r = await ingestAd({ ...merged, askingCents: detail.askingCents ?? stored.askingCents }, { origin: ad.origin, source: ad.source, isDemo: false, enqueueAnalysis: false });
  await analyzeAd(r.adId);
  const images = await prisma.advertisementImage.count({ where: { adId: ad.id } });
  return { ok: true, images };
});
