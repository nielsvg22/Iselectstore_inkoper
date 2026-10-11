import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { explain, failedReasons, groupSchema, type Group } from "@/lib/engines/filters";
import { contextFromRow } from "@/lib/pipeline/context";
import { getConfig } from "@/lib/settings/store";

const body = z.object({ tree: groupSchema, limit: z.number().int().min(10).max(1000).default(400) });

/** Test een filterboom op bestaande advertenties en leg per advertentie uit waarom die wel/niet voldoet. */
export const POST = route(async (req) => {
  const { tree, limit } = await readJson(req, body);
  const cfg = await getConfig();
  const rows = await prisma.dealAnalysis.findMany({
    where: { isCurrent: true, ad: { isDemo: cfg.demoMode, duplicateOfId: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { ad: { include: { _count: { select: { images: true } }, product: { include: { specs: true } }, risk: true } } },
  });
  const t = tree as Group;
  const perCondition = new Map<string, { label: string; failed: number }>();
  const items = rows.map((r) => {
    const ctx = contextFromRow(r);
    const e = explain(t, ctx);
    const reasons = failedReasons(e);
    // tel per voorwaarde hoe vaak deze de blokkerende factor is (inzicht in welke regel te streng is)
    for (const reason of reasons) {
      const k = reason.split(" — nu:")[0];
      const cur = perCondition.get(k) ?? { label: k, failed: 0 };
      cur.failed++;
      perCondition.set(k, cur);
    }
    return { adId: r.adId, title: r.ad.title, model: r.ad.product?.modelLabel ?? null, askingCents: r.askingCents, netProfitCents: r.netProfitCents, score: r.score, pass: e.pass, reasons, explain: e };
  });
  const matched = items.filter((i) => i.pass);
  return {
    total: items.length,
    matched: matched.length,
    // eerst de treffers, daarna een selectie niet-treffers met reden
    items: [...matched.slice(0, 25), ...items.filter((i) => !i.pass).slice(0, 25)],
    blockers: [...perCondition.values()].sort((a, b) => b.failed - a.failed).slice(0, 8),
  };
});
