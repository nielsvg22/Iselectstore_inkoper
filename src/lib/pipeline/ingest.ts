import type { DataOrigin, Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { contentHash, findDuplicate, fingerprint, type DupCandidate } from "../engines/dedupe";
import { recognizeByRules } from "../engines/recognition";
import { enqueue } from "../jobs/queue";
import type { RawAd } from "../sources/types";

export interface IngestResult {
  adId: string;
  created: boolean;
  changed: boolean;
  priceChanged: boolean;
  duplicateOfId: string | null;
}

export async function ingestAd(raw: RawAd, opts: { origin: DataOrigin; isDemo?: boolean; source?: string; enqueueAnalysis?: boolean }): Promise<IngestResult> {
  const source = opts.source ?? (opts.isDemo ? "demo" : "marktplaats");
  const imageUrls = raw.imageUrls ?? [];
  const description = raw.description ?? "";
  const rec = recognizeByRules({ title: raw.title, description, structured: raw.attributes ?? null });
  const storage = typeof rec.facts.storageGb?.value === "number" ? rec.facts.storageGb.value : null;
  const fp = fingerprint(raw.title, rec.modelKey, storage);
  const hash = contentHash({ title: raw.title, description, askingCents: raw.askingCents ?? null, imageUrls });
  const existing = await prisma.advertisement.findUnique({ where: { source_externalId: { source, externalId: raw.externalId } }, select: { id: true, askingPriceCents: true, contentHash: true, status: true } });
  const now = new Date();

  const data = {
    origin: opts.origin,
    isDemo: opts.isDemo ?? false,
    url: raw.url,
    title: raw.title.slice(0, 300),
    description: description.slice(0, 20000),
    askingPriceCents: raw.askingCents ?? null,
    location: raw.location ?? null,
    postalCode: raw.postalCode ?? null,
    distanceKm: raw.distanceKm ?? null,
    category: raw.category ?? null,
    sellerType: raw.sellerType ?? null,
    shippingOptions: (raw.shipping ?? []) as Prisma.InputJsonValue,
    conditionText: raw.conditionText ?? null,
    publishedAt: raw.publishedAt ?? null,
    lastSeenAt: now,
    lastCheckedOkAt: now,
    fingerprint: fp,
    contentHash: hash,
    rawPayload: (raw.attributes ? { attributes: raw.attributes } : undefined) as Prisma.InputJsonValue | undefined,
  };

  let adId: string;
  let created = false;
  let changed = false;
  let priceChanged = false;

  if (!existing) {
    const ad = await prisma.advertisement.create({
      data: { ...data, source, externalId: raw.externalId, status: "NEW", images: { create: imageUrls.slice(0, 12).map((url, position) => ({ url, position })) } },
    });
    adId = ad.id;
    created = true;
    changed = true;
    if (raw.askingCents != null) await prisma.priceHistory.create({ data: { adId, priceCents: raw.askingCents } });
  } else {
    adId = existing.id;
    changed = existing.contentHash !== hash;
    priceChanged = existing.askingPriceCents !== (raw.askingCents ?? null);
    await prisma.advertisement.update({ where: { id: adId }, data: { ...data, status: changed ? "NEW" : undefined } });
    if (changed) {
      await prisma.advertisementImage.deleteMany({ where: { adId } });
      await prisma.advertisementImage.createMany({ data: imageUrls.slice(0, 12).map((url, position) => ({ adId, url, position })) });
    }
    if (priceChanged && raw.askingCents != null) await prisma.priceHistory.create({ data: { adId, priceCents: raw.askingCents } });
  }

  // Duplicaatdetectie (andere id, zelfde aanbod) alleen bij nieuwe of gewijzigde advertenties
  let duplicateOfId: string | null = null;
  if (changed) {
    const since = new Date(Date.now() - 45 * 86400000);
    const cands = await prisma.advertisement.findMany({
      where: { id: { not: adId }, isDemo: data.isDemo, duplicateOfId: null, lastSeenAt: { gte: since }, OR: [{ fingerprint: fp }, { title: { contains: raw.title.slice(0, 12), mode: "insensitive" } }] },
      select: { id: true, title: true, askingPriceCents: true, location: true, images: { select: { url: true } } },
      take: 200,
    });
    const list: DupCandidate[] = cands.map((c) => ({ id: c.id, title: c.title, askingCents: c.askingPriceCents, location: c.location, imageUrls: c.images.map((i) => i.url) }));
    const dup = findDuplicate({ id: adId, title: raw.title, askingCents: raw.askingCents ?? null, location: raw.location ?? null, imageUrls, modelKey: rec.modelKey, storageGb: storage }, list);
    duplicateOfId = dup?.duplicateOfId ?? null;
    await prisma.advertisement.update({ where: { id: adId }, data: { duplicateOfId } });
  } else {
    const cur = await prisma.advertisement.findUnique({ where: { id: adId }, select: { duplicateOfId: true } });
    duplicateOfId = cur?.duplicateOfId ?? null;
  }

  if (changed && !duplicateOfId && opts.enqueueAnalysis !== false) {
    await prisma.advertisement.update({ where: { id: adId }, data: { status: "QUEUED" } });
    await enqueue({ type: "ANALYZE_AD", payload: { adId }, priority: created ? 10 : 5, uniqueKey: `analyze:${adId}:${hash}` });
  }
  return { adId, created, changed, priceChanged, duplicateOfId };
}
