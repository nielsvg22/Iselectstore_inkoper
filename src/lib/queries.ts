import type { Prisma } from "@prisma/client";
import { prisma } from "./db/client";
import { evaluate, type Group } from "./engines/filters";
import { contextFromRow } from "./pipeline/context";
import { getConfig } from "./settings/store";

export interface DealFilters {
  q?: string;
  band?: string;
  minScore?: number;
  family?: string;
  profileId?: string;
  /** Eigen (opgeslagen) filter: wordt in-memory op de resultaten toegepast */
  savedTree?: Group;
  userState?: string;
  review?: boolean;
  showBlocked?: boolean;
  sort?: "score" | "profit" | "roi" | "new" | "price";
  limit?: number;
  offset?: number;
}

export async function listDeals(f: DealFilters) {
  const cfg = await getConfig();
  const where: Prisma.DealAnalysisWhereInput = {
    isCurrent: true,
    ...(f.band ? { band: f.band as never } : {}),
    ...(f.minScore != null ? { score: { gte: f.minScore } } : {}),
    ...(f.showBlocked ? {} : { blocked: false }),
    ad: {
      isDemo: cfg.demoMode,
      duplicateOfId: null,
      userState: f.userState ? (f.userState as never) : { not: "IGNORED" },
      ...(f.q ? { title: { contains: f.q, mode: "insensitive" } } : {}),
      ...(f.review ? { needsManualReview: true } : {}),
      ...(f.family ? { product: { family: f.family } } : {}),
      ...(f.profileId ? { matches: { some: { profileId: f.profileId, matched: true } } } : {}),
    },
  };
  const orderBy: Prisma.DealAnalysisOrderByWithRelationInput =
    f.sort === "profit" ? { netProfitCents: "desc" } : f.sort === "roi" ? { roiPct: "desc" } : f.sort === "new" ? { ad: { firstSeenAt: "desc" } } : f.sort === "price" ? { askingCents: "asc" } : { score: "desc" };
  const include = { ad: { include: { images: { orderBy: { position: "asc" as const }, take: 1 }, _count: { select: { images: true } }, product: { include: { specs: true } }, risk: true } } };
  const take = Math.min(200, f.limit ?? 48);
  const skip = f.offset ?? 0;
  if (f.savedTree) {
    // Eigen filter: laad een ruime, gesorteerde kandidatenset en pas de regelboom per advertentie toe
    const candidates = await prisma.dealAnalysis.findMany({ where, orderBy: [orderBy, { createdAt: "desc" }], take: 1500, include });
    const tree = f.savedTree;
    const matched = candidates.filter((r) => evaluate(tree, contextFromRow(r)));
    return { rows: matched.slice(skip, skip + take), total: matched.length };
  }
  const [rows, total] = await Promise.all([
    prisma.dealAnalysis.findMany({ where, orderBy: [orderBy, { createdAt: "desc" }], take, skip, include }),
    prisma.dealAnalysis.count({ where }),
  ]);
  return { rows, total };
}

export async function dashboardStats() {
  const cfg = await getConfig();
  const adWhere = { isDemo: cfg.demoMode, duplicateOfId: null, userState: { not: "IGNORED" as const } };
  const since = new Date(Date.now() - 24 * 3600_000);
  const [newAds, deals, review, totalAds] = await Promise.all([
    prisma.advertisement.count({ where: { ...adWhere, firstSeenAt: { gte: since } } }),
    prisma.dealAnalysis.findMany({
      where: { isCurrent: true, blocked: false, score: { gte: cfg.targets.minDealScore }, ad: adWhere },
      select: { netProfitCents: true, conservativeProfitCents: true, roiPct: true, uncertain: true },
      take: 5000,
    }),
    prisma.advertisement.count({ where: { ...adWhere, needsManualReview: true } }),
    prisma.advertisement.count({ where: adWhere }),
  ]);
  const positive = deals.filter((d) => d.netProfitCents > 0);
  const totalProfit = positive.reduce((a, d) => a + d.netProfitCents, 0);
  const conservative = positive.reduce((a, d) => a + Math.max(0, d.conservativeProfitCents), 0);
  const avgRoi = positive.length ? positive.reduce((a, d) => a + d.roiPct, 0) / positive.length : 0;
  return { newAds, interesting: deals.length, totalProfit, conservativeProfit: conservative, uncertainCount: deals.filter((d) => d.uncertain).length, avgRoi, review, totalAds };
}

export async function getAdDetail(id: string) {
  const ad = await prisma.advertisement.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      product: { include: { specs: true } },
      risk: true,
      priceHistory: { orderBy: { observedAt: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 10 },
      notifications: { orderBy: { createdAt: "desc" }, take: 10 },
      purchase: { include: { sale: true } },
      watchlist: true,
    },
  });
  if (!ad) return null;
  const valuations = await prisma.valuationHistory.findMany({ where: { adId: id }, orderBy: { computedAt: "asc" }, take: 50 });
  const modelKey = ad.product?.modelKey ?? "";
  const comparables = modelKey
    ? await prisma.marketComparable.findMany({ where: { modelKey, isDemo: ad.isDemo, OR: [{ sourceAdId: null }, { sourceAdId: { not: id } }] }, orderBy: { observedAt: "desc" }, take: 30 })
    : [];
  const similar = modelKey
    ? await prisma.advertisement.findMany({
        where: { id: { not: id }, isDemo: ad.isDemo, duplicateOfId: null, product: { modelKey } },
        include: { images: { take: 1, orderBy: { position: "asc" } }, analyses: { where: { isCurrent: true }, take: 1 } },
        orderBy: { lastSeenAt: "desc" },
        take: 8,
      })
    : [];
  return { ad, valuations, comparables, similar, current: ad.analyses.find((a) => a.isCurrent) ?? null };
}

export async function purchaseStats(userId: string) {
  const purchases = await prisma.purchase.findMany({ where: { userId }, include: { sale: true }, orderBy: { createdAt: "desc" } });
  const bought = purchases.filter((p) => ["BOUGHT", "LISTED", "SOLD"].includes(p.status) && p.buyPriceCents != null);
  const sold = purchases.filter((p) => p.status === "SOLD" && p.sale);
  const totalBuy = bought.reduce((a, p) => a + (p.buyPriceCents ?? 0), 0);
  const stock = purchases.filter((p) => ["BOUGHT", "LISTED"].includes(p.status));
  const stockValue = stock.reduce((a, p) => a + (p.buyPriceCents ?? 0) + p.repairCostCents + p.extraCostCents, 0);
  const profits = sold.map((p) => ({
    p,
    profit: p.sale!.salePriceCents - (p.buyPriceCents ?? 0) - p.repairCostCents - p.extraCostCents - p.sale!.extraCostCents,
    days: p.boughtAt ? Math.max(0, Math.round((p.sale!.soldAt.getTime() - p.boughtAt.getTime()) / 86400000)) : null,
  }));
  const realized = profits.reduce((a, x) => a + x.profit, 0);
  const days = profits.filter((x) => x.days != null).map((x) => x.days as number);
  const byModel = new Map<string, { label: string; profit: number; count: number }>();
  for (const x of profits) {
    const k = x.p.modelKey ?? x.p.title;
    const cur = byModel.get(k) ?? { label: x.p.title, profit: 0, count: 0 };
    cur.profit += x.profit;
    cur.count++;
    byModel.set(k, cur);
  }
  const timeline = [...profits]
    .sort((a, b) => a.p.sale!.soldAt.getTime() - b.p.sale!.soldAt.getTime())
    .reduce<Array<{ date: string; cumulative: number }>>((acc, x) => {
      const prev = acc.length ? acc[acc.length - 1].cumulative : 0;
      acc.push({ date: x.p.sale!.soldAt.toISOString().slice(0, 10), cumulative: prev + x.profit });
      return acc;
    }, []);
  return {
    purchases,
    totalBuy,
    stockValue,
    realized,
    avgProfit: sold.length ? realized / sold.length : 0,
    avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
    soldCount: sold.length,
    best: [...byModel.values()].sort((a, b) => b.profit - a.profit).slice(0, 5),
    timeline,
    perPurchaseProfit: new Map(profits.map((x) => [x.p.id, x.profit])),
  };
}
