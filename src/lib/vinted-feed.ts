import { prisma } from "./db/client";

export interface VintedAdRow {
  id: string;
  title: string;
  url: string;
  image: string | null;
  priceEuro: number | null;
  model: string | null;
  seenAt: string;
  publishedAt: string | null;
  /** seconden tussen (geschatte) plaatsing en detectie; alleen als Vinted een plaatsingstijd gaf */
  detectedAfterSec: number | null;
  status: string;
  step: string | null;
  reason: string;
  notified: number;
  detailLoaded: boolean;
}

/** De nieuwste Vinted-advertenties met het oordeel van de filters, zodat direct te zien is of een geplaatste advertentie is gevonden en waarom wel/niet gemeld. */
export async function latestVintedAds(limit = 60): Promise<VintedAdRow[]> {
  const ads = await prisma.advertisement.findMany({
    where: { source: "vinted", isDemo: false },
    orderBy: { firstSeenAt: "desc" },
    take: limit,
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      product: { select: { modelLabel: true } },
      analyses: { where: { isCurrent: true }, take: 1, select: { costs: true } },
      _count: { select: { notifications: { where: { channel: { in: ["WEBPUSH", "INAPP"] }, status: { not: "SKIPPED" } } } } },
    },
  });
  return ads.map((a) => {
    const v = (a.analyses[0]?.costs as { rules?: { status?: string; decidedBy?: string | null; reasons?: string[]; notes?: string[] } } | null)?.rules;
    const status = v?.status ?? (a.analyses.length ? "geen oordeel" : "wacht op analyse");
    const detected = a.publishedAt ? Math.round((a.firstSeenAt.getTime() - a.publishedAt.getTime()) / 1000) : null;
    return {
      id: a.id, title: a.title, url: a.url, image: a.images[0]?.url ?? null,
      priceEuro: a.askingPriceCents != null ? a.askingPriceCents / 100 : null,
      model: a.product?.modelLabel ?? null,
      seenAt: a.firstSeenAt.toISOString(), publishedAt: a.publishedAt?.toISOString() ?? null,
      detectedAfterSec: detected != null && detected >= 0 && detected < 6 * 3600 ? detected : null,
      status, step: v?.decidedBy ?? null,
      reason: v?.reasons?.[0] ?? (status === "match" || status === "high" ? "Voldoet aan alle ingestelde filters" : v?.notes?.[0] ?? ""),
      notified: a._count.notifications,
      detailLoaded: a.detailFetchedAt != null,
    };
  });
}
