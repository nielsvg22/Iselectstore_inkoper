import { route } from "@/lib/api";
import { listDeals } from "@/lib/queries";
import { z } from "zod";

const q = z.object({
  q: z.string().max(100).optional(),
  band: z.enum(["TOP", "VERY_INTERESTING", "INTERESTING", "MODERATE", "NOT_INTERESTING"]).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  family: z.string().max(30).optional(),
  profileId: z.string().max(40).optional(),
  userState: z.enum(["NONE", "INTERESTING", "FAVORITE", "IGNORED"]).optional(),
  review: z.enum(["1", "0"]).optional(),
  showBlocked: z.enum(["1", "0"]).optional(),
  sort: z.enum(["score", "profit", "roi", "new", "price"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = route(async (req) => {
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { rows, total } = await listDeals({ ...p, review: p.review === "1", showBlocked: p.showBlocked === "1" });
  return {
    total,
    items: rows.map((a) => ({
      id: a.adId,
      title: a.ad.title,
      model: a.ad.product?.modelLabel ?? null,
      askingCents: a.askingCents,
      expectedCents: a.expectedCents,
      netProfitCents: a.netProfitCents,
      roiPct: a.roiPct,
      maxBidCents: a.maxBidCents,
      score: a.score,
      band: a.band,
      uncertain: a.uncertain,
      blocked: a.blocked,
      risk: a.ad.risk?.level ?? null,
      location: a.ad.location,
      isDemo: a.ad.isDemo,
      url: a.ad.isDemo ? null : a.ad.url,
    })),
  };
});
