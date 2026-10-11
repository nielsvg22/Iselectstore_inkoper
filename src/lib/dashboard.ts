import type { Prisma } from "@prisma/client";
import { prisma } from "./db/client";
import { CATEGORY_GROUPS, familiesOf } from "./product-art";
import { discountPct } from "./deal-badge";
import { getConfig } from "./settings/store";

export interface DealRowLite {
  adId: string;
  title: string;
  model: string;
  family: string | null;
  variant: string;
  image: string | null;
  askingCents: number;
  expectedCents: number;
  netProfitCents: number;
  score: number;
  blocked: boolean;
  discount: number | null;
  firstSeenAt: string;
  isDemo: boolean;
}

const DAY = 86400000;

function variantOf(specs: Array<{ key: string; value: string; source: string }>): string {
  const get = (k: string) => specs.find((s) => s.key === k && s.source !== "UNKNOWN")?.value;
  const size = (v?: string) => (v && Number.isFinite(Number(v)) ? (Number(v) >= 1024 ? `${Number(v) / 1024}TB` : `${Number(v)}GB`) : null);
  const st = size(get("storageGb"));
  const ram = size(get("ramGb"));
  return [ram && st ? `${ram} / ${st}` : st, get("color")].filter(Boolean).join(" · ");
}

export async function dealRows(opts: { families?: string[]; take?: number; skip?: number }): Promise<DealRowLite[]> {
  const cfg = await getConfig();
  const where: Prisma.DealAnalysisWhereInput = {
    isCurrent: true,
    blocked: false,
    askingCents: { gt: 0 },
    expectedCents: { gt: 0 },
    ad: { isDemo: cfg.demoMode, duplicateOfId: null, userState: { not: "IGNORED" }, ...(opts.families ? { product: { family: { in: opts.families } } } : {}) },
  };
  const rows = await prisma.dealAnalysis.findMany({
    where,
    orderBy: { ad: { firstSeenAt: "desc" } },
    take: opts.take ?? 5,
    skip: opts.skip ?? 0,
    include: { ad: { include: { images: { orderBy: { position: "asc" }, take: 1 }, product: { include: { specs: true } } } } },
  });
  return rows.map((r) => ({
    adId: r.adId,
    title: r.ad.title,
    model: r.ad.product?.modelLabel ?? r.ad.title,
    family: r.ad.product?.family ?? null,
    variant: variantOf(r.ad.product?.specs ?? []),
    image: r.ad.images[0]?.url ?? null,
    askingCents: r.askingCents,
    expectedCents: r.expectedCents,
    netProfitCents: r.netProfitCents,
    score: r.score,
    blocked: r.blocked,
    discount: discountPct(r.askingCents, r.expectedCents),
    firstSeenAt: r.ad.firstSeenAt.toISOString(),
    isDemo: r.ad.isDemo,
  }));
}

const pct = (now: number, prev: number): number | null => (prev ? Math.round(((now - prev) / Math.abs(prev)) * 100) : null);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export interface DashboardData {
  stats: {
    newDeals: { value: number; delta: number | null; series: number[] };
    margin: { value: number; delta: number | null; series: number[] };
    profiles: { value: number; sub: string; series: number[] };
    priceDiff: { value: number | null; series: number[] };
  };
  categories: Array<{ id: string; label: string; art: string | null; count: number }>;
  newest: DealRowLite[];
  feed: DealRowLite[];
}

export async function getDashboard(cat?: string): Promise<DashboardData> {
  const cfg = await getConfig();
  const fams = familiesOf(cat);
  const now = Date.now();
  const adWhere: Prisma.AdvertisementWhereInput = { isDemo: cfg.demoMode, duplicateOfId: null, userState: { not: "IGNORED" }, firstSeenAt: { gte: new Date(now - 14 * DAY) }, ...(fams ? { product: { family: { in: fams } } } : {}) };
  const recent = await prisma.dealAnalysis.findMany({
    where: { isCurrent: true, blocked: false, ad: adWhere },
    select: { score: true, netProfitCents: true, askingCents: true, expectedCents: true, ad: { select: { firstSeenAt: true } } },
    take: 8000,
  });
  const interesting = recent.filter((r) => r.score >= cfg.targets.minDealScore);
  const inRange = (r: { ad: { firstSeenAt: Date } }, from: number, to: number) => {
    const t = now - r.ad.firstSeenAt.getTime();
    return t >= from && t < to;
  };
  const nNow = interesting.filter((r) => inRange(r, 0, DAY)).length;
  const nPrev = interesting.filter((r) => inRange(r, DAY, 2 * DAY)).length;
  const wk = interesting.filter((r) => inRange(r, 0, 7 * DAY));
  const wkPrev = interesting.filter((r) => inRange(r, 7 * DAY, 14 * DAY));
  const mNow = avg(wk.map((r) => r.netProfitCents));
  const mPrev = avg(wkPrev.map((r) => r.netProfitCents));
  const day = (r: { ad: { firstSeenAt: Date } }) => Math.min(6, Math.floor((now - r.ad.firstSeenAt.getTime()) / DAY));
  const series = (rows: typeof recent, f: (r: (typeof recent)[number]) => number, mode: "sum" | "avg") => {
    const buckets: number[][] = Array.from({ length: 7 }, () => []);
    for (const r of rows) if (now - r.ad.firstSeenAt.getTime() < 7 * DAY) buckets[day(r)].push(f(r));
    return buckets.map((b) => (mode === "sum" ? b.length : avg(b))).reverse();
  };
  const diffs = interesting.map((r) => (r.expectedCents ? ((r.askingCents - r.expectedCents) / r.expectedCents) * 100 : 0));
  const profiles = await prisma.searchProfile.findMany({ where: { active: true }, select: { sourceConfig: true } });
  const queries = new Set<string>();
  const categories = new Set<string>();
  for (const p of profiles) {
    const c = (p.sourceConfig ?? {}) as { queries?: string[]; category?: string };
    (c.queries ?? []).forEach((q) => queries.add(q.toLowerCase()));
    if (c.category) categories.add(c.category);
  }
  const fam = await prisma.appleProduct.groupBy({
    by: ["family"],
    where: { ad: { isDemo: cfg.demoMode, duplicateOfId: null, analyses: { some: { isCurrent: true, blocked: false } } } },
    _count: { _all: true },
  });
  const famCount = new Map(fam.map((f) => [f.family, f._count._all]));
  const [newest, feed] = await Promise.all([dealRows({ families: fams, take: 5 }), dealRows({ take: 5 })]);
  return {
    stats: {
      newDeals: { value: nNow, delta: pct(nNow, nPrev), series: series(interesting, () => 1, "sum") },
      margin: { value: Math.round(mNow), delta: pct(mNow, mPrev), series: series(interesting, (r) => r.netProfitCents, "avg") },
      profiles: { value: profiles.length, sub: queries.size || categories.size ? `${queries.size} ${queries.size === 1 ? "zoekterm" : "zoektermen"}, ${categories.size} ${categories.size === 1 ? "categorie" : "categorieën"}` : "nog geen zoektermen", series: series(recent, () => 1, "sum") },
      priceDiff: { value: diffs.length ? Math.round(avg(diffs)) : null, series: series(interesting, (r) => (r.expectedCents ? ((r.askingCents - r.expectedCents) / r.expectedCents) * 100 : 0), "avg") },
    },
    categories: CATEGORY_GROUPS.filter((g) => g.art).map((g) => ({ id: g.id, label: g.label, art: g.art, count: g.families.reduce((a, f) => a + (famCount.get(f) ?? 0), 0) })),
    newest,
    feed,
  };
}
