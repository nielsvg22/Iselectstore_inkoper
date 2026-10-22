import { createHash } from "node:crypto";
import { coordinateKey, coordinatesFromRaw, validDriveSeconds, ROUTE_TTL_MS } from "../radar/driving";
import { getConfig } from "../settings/store";
import type { DataOrigin, Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import {
  contentHash,
  findDuplicate,
  fingerprint,
  type DupCandidate,
} from "../engines/dedupe";
import { mergeImages } from "../images";
import { recognizeByRules } from "../engines/recognition";
import type { RawAd } from "../sources/types";

export interface IngestResult {
  adId: string;
  created: boolean;
  changed: boolean;
  priceChanged: boolean;
  duplicateOfId: string | null;
}

export interface IngestOptions {
  origin: DataOrigin;
  isDemo?: boolean;
  source?: string;
  enqueueAnalysis?: boolean;
  partial?: boolean;
}

export async function ingestAd(raw: RawAd, opts: IngestOptions): Promise<IngestResult> {
  const source = opts.source ?? (opts.isDemo ? "demo" : "marktplaats");
  const externalId = source === "marktplaats" && /^m\d+$/i.test(raw.externalId.trim())
    ? raw.externalId.trim().toLowerCase() : raw.externalId;
  const routingEnabled = (await getConfig()).policies.distance.mode === "driving";
  return prisma.$transaction(async tx => {
    // Serialise only the same canonical advertisement, across all ingestion sources/processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ingest:${source}:${externalId}`}))`;
    return ingestLocked(tx, { ...raw, externalId }, opts, routingEnabled);
  }, { timeout: 30000, maxWait: 30000 });
}

async function ingestLocked(db: Prisma.TransactionClient, raw: RawAd, opts: IngestOptions, routingEnabled: boolean): Promise<IngestResult> {
  const source = opts.source ?? (opts.isDemo ? "demo" : "marktplaats");
  const existing = await db.advertisement.findUnique({
    where: { source_externalId: { source, externalId: raw.externalId } },
    select: {
      id: true,
      askingPriceCents: true,
      contentHash: true,
      status: true,
      description: true,
      detailFetchedAt: true,
      publishedAt: true,
      distanceKm: true,
      rawPayload: true, driveSeconds: true, driveCalculatedAt: true, driveCoordinatesKey: true,
      sellerSignals: true,
      sellerId: true, sellerName: true, sellerVerified: true,
      location: true, postalCode: true, category: true, sellerType: true,
      shippingOptions: true, conditionText: true,
      images: { select: { url: true }, orderBy: { position: "asc" } },
    },
  });
  let imageUrls = raw.imageUrls ?? [];
  let description = raw.description ?? "";
  // Samenvattingen (zoekresultaten) mogen de volledige tekst en fotoset uit de detailpagina nooit verdringen
  if (opts.partial && !raw.detailLoaded && existing) {
    if (
      existing.detailFetchedAt ||
      existing.description.length > description.length
    )
      description = existing.description;
    imageUrls = existing.detailFetchedAt
      ? existing.images.map((i) => i.url)
      : mergeImages(
          existing.images.map((i) => i.url),
          imageUrls,
        );
  }
  const partial = opts.partial && !raw.detailLoaded;
  const askingCents = raw.askingCents === undefined && partial ? existing?.askingPriceCents ?? null : raw.askingCents ?? null;
  const oldAttrs = (existing?.rawPayload as { attributes?: Record<string, string | number> } | null)?.attributes ?? {};
  const keepPublication = Boolean(existing?.publishedAt && (oldAttrs.publicationPrecision === "exact"
    ? raw.attributes?.publicationPrecision !== "exact"
    : existing.detailFetchedAt && !raw.detailLoaded));
  const previousSignals = existing?.sellerSignals as Record<string, unknown> | null;
  const sameSeller = !raw.seller?.id || !existing?.sellerId || raw.seller.id === existing.sellerId;
  const signal = (key: string, value: unknown) => value ?? (sameSeller ? previousSignals?.[key] : null) ?? null;
  const rec = recognizeByRules({
    title: raw.title,
    description,
    structured: raw.attributes ?? null,
  });
  const storage =
    typeof rec.facts.storageGb?.value === "number"
      ? rec.facts.storageGb.value
      : null;
  const fp = fingerprint(raw.title, rec.modelKey, storage);
  const hash = contentHash({
    title: raw.title,
    description,
    askingCents,
    imageUrls,
  });
  const now = new Date();

  const data = {
    origin: opts.origin,
    isDemo: opts.isDemo ?? false,
    url: raw.url,
    title: raw.title.slice(0, 300),
    description: description.slice(0, 20000),
    askingPriceCents: askingCents,
    location: raw.location ?? (partial ? existing?.location : null) ?? null,
    postalCode: raw.postalCode ?? (partial ? existing?.postalCode : null) ?? null,
    distanceKm: raw.distanceKm ?? (partial ? existing?.distanceKm : null) ?? null,
    category: raw.category ?? (partial ? existing?.category : null) ?? null,
    sellerType: raw.sellerType ?? (partial ? existing?.sellerType : null) ?? null,
    ...(raw.seller
      ? {
          sellerId: raw.seller.id ?? existing?.sellerId ?? null,
          sellerName: raw.seller.name ?? (sameSeller ? existing?.sellerName : null) ?? null,
          sellerVerified: raw.seller.verified ?? (sameSeller ? existing?.sellerVerified : null) ?? null,
          sellerSignals: {
            business: signal("business", raw.seller.business),
            anonymous: signal("anonymous", raw.seller.anonymous),
            rating: signal("rating", raw.seller.rating),
            reviewCount: signal("reviewCount", raw.seller.reviewCount),
            accountAgeMonths: signal("accountAgeMonths", raw.seller.accountAgeMonths),
          } as Prisma.InputJsonValue,
        }
      : {}),
    shippingOptions: (raw.shipping ?? (partial ? existing?.shippingOptions : null) ?? []) as Prisma.InputJsonValue,
    conditionText: raw.conditionText ?? (partial ? existing?.conditionText : null) ?? null,
    publishedAt:
      keepPublication
        ? existing!.publishedAt
        : (raw.publishedAt ?? existing?.publishedAt ?? null),
    lastSeenAt: now,
    lastCheckedOkAt: now,
    ...(raw.detailLoaded ? { detailFetchedAt: now } : {}),
    fingerprint: fp,
    contentHash: hash,
    rawPayload: {
      ...((existing?.rawPayload as object) ?? {}),
      attributes: { ...oldAttrs, ...raw.attributes,
        firstDetectionSource: oldAttrs.firstDetectionSource ?? (existing ? "unknown" : raw.attributes?.detectionSource ?? opts.origin),
        ...(keepPublication ? { publicationPrecision: oldAttrs.publicationPrecision ?? "unknown" } : {}),
      },
    } as Prisma.InputJsonValue,
  };

  if (existing && raw.location != null && raw.location !== existing.location && !coordinatesFromRaw({ attributes: raw.attributes })) {
    const attrs = (data.rawPayload as { attributes: Record<string, unknown> }).attributes;
    delete attrs.locationLatitude; delete attrs.locationLongitude;
  }
  const point = coordinatesFromRaw(data.rawPayload);
  const oldPoint = coordinatesFromRaw(existing?.rawPayload);
  const moved = Boolean(existing && (point ? !oldPoint || coordinateKey(point) !== coordinateKey(oldPoint) : oldPoint));
  const routeReset = moved ? { driveSeconds: null, driveMeters: null, driveCalculatedAt: null, driveCoordinatesKey: null, driveError: null } : {};

  const facts = (seller: unknown, shipping: unknown, point: unknown) => JSON.stringify([seller ?? null, shipping ?? [], point]);
  const eligibility = facts(data.sellerSignals ?? existing?.sellerSignals, data.shippingOptions, point);
  const eligibilityChanged = Boolean(existing && eligibility !== facts(existing.sellerSignals, existing.shippingOptions, oldPoint));
  const factsHash = createHash("sha256").update(eligibility).digest("hex").slice(0, 16);
  let adId: string;
  let created = false;
  let changed = false;
  let priceChanged = false;

  if (!existing) {
    const ad = await db.advertisement.create({
      data: {
        ...data,
        source,
        externalId: raw.externalId,
        status: "NEW",
        firstSeenAt: now,
        prefilteredAt: now,
        images: {
          create: imageUrls
            .slice(0, 12)
            .map((url, position) => ({ url, position })),
        },
      },
    });
    adId = ad.id;
    created = true;
    changed = true;
    if (raw.askingCents != null)
      await db.priceHistory.create({
        data: { adId, priceCents: raw.askingCents },
      });
  } else {
    adId = existing.id;
    changed = existing.contentHash !== hash;
    priceChanged = existing.askingPriceCents !== askingCents;
    await db.advertisement.update({
      where: { id: adId },
      data: { ...data, ...routeReset, status: changed ? "NEW" : undefined, ...(partial ? { seenCount: { increment: 1 } } : {}) },
    });
    if (changed) {
      await db.advertisementImage.deleteMany({ where: { adId } });
      await db.advertisementImage.createMany({
        data: imageUrls
          .slice(0, 12)
          .map((url, position) => ({ adId, url, position })),
      });
    }
    if (priceChanged && raw.askingCents != null)
      await db.priceHistory.create({
        data: { adId, priceCents: raw.askingCents },
      });
  }

  // Duplicaatdetectie (andere id, zelfde aanbod) alleen bij nieuwe of gewijzigde advertenties
  let duplicateOfId: string | null = null;
  if (changed) {
    const since = new Date(Date.now() - 45 * 86400000);
    const cands = await db.advertisement.findMany({
      where: {
        id: { not: adId },
        isDemo: data.isDemo,
        duplicateOfId: null,
        lastSeenAt: { gte: since },
        OR: [
          { fingerprint: fp },
          { title: { contains: raw.title.slice(0, 12), mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        askingPriceCents: true,
        location: true,
        images: { select: { url: true } },
      },
      take: 200,
    });
    const list: DupCandidate[] = cands.map((c) => ({
      id: c.id,
      title: c.title,
      askingCents: c.askingPriceCents,
      location: c.location,
      imageUrls: c.images.map((i) => i.url),
    }));
    const dup = findDuplicate(
      {
        id: adId,
        title: raw.title,
        askingCents,
        location: raw.location ?? (partial ? existing?.location : null) ?? null,
        imageUrls,
        modelKey: rec.modelKey,
        storageGb: storage,
      },
      list,
    );
    duplicateOfId = dup?.duplicateOfId ?? null;
    await db.advertisement.update({
      where: { id: adId },
      data: { duplicateOfId },
    });
  } else {
    const cur = await db.advertisement.findUnique({
      where: { id: adId },
      select: { duplicateOfId: true },
    });
    duplicateOfId = cur?.duplicateOfId ?? null;
  }

  if ((changed || eligibilityChanged) && !duplicateOfId && opts.enqueueAnalysis !== false) {
    await db.advertisement.update({
      where: { id: adId },
      data: { status: "QUEUED" },
    });
    const uniqueKey = `analyze:${adId}:${hash}:${factsHash}`;
    await db.backgroundJob.upsert({
      where: { uniqueKey }, update: {},
      create: { type: "ANALYZE_AD", payload: { adId, quick: opts.partial === true && !raw.detailLoaded },
        priority: created ? 20 : 12, uniqueKey },
    });
  }
  if (routingEnabled && point && !duplicateOfId && opts.enqueueAnalysis !== false && (!existing || moved || validDriveSeconds(existing) == null)) {
    const uniqueKey = `route:${adId}:${coordinateKey(point)}:${Math.floor(now.getTime() / ROUTE_TTL_MS)}`;
    const previous = await db.backgroundJob.findUnique({ where: { uniqueKey }, select: { status: true } });
    await db.backgroundJob.upsert({ where: { uniqueKey },
      update: previous && ["DONE", "DEAD", "FAILED"].includes(previous.status) ? { status: "PENDING", attempts: 0, runAt: now, finishedAt: null, lastError: null } : {},
      create: { type: "ROUTE_AD", payload: { adId }, priority: created ? 25 : 15, uniqueKey },
    });
  }
  return { adId, created, changed, priceChanged, duplicateOfId };
}
