import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { loadRules, buildVerdictInput } from "@/lib/rules/apply";
import { evaluateRules } from "@/lib/rules/verdict";
import { rulesSchema } from "@/lib/rules/config";

/**
 * "Testen op bestaande advertenties": de laatste advertenties opnieuw beoordelen met de huidige (of meegegeven) regels.
 * Er wordt niets opgeslagen of gemeld; het geeft per uitkomst een telling en voorbeelden met de reden.
 */
export const POST = route(async (req) => {
  const body = await readJson(req, z.object({ limit: z.number().int().min(10).max(1000).default(300), rules: z.unknown().optional() }));
  const loaded = await loadRules(true);
  const cfg = body.rules ? rulesSchema.parse(body.rules) : loaded.cfg;
  const ads = await prisma.advertisement.findMany({
    where: { isDemo: false, product: { isNot: null } },
    orderBy: { firstSeenAt: "desc" },
    take: body.limit,
    include: { product: { include: { specs: true } } },
  });
  const counts: Record<string, number> = { skip: 0, reject: 0, review: 0, match: 0, high: 0 };
  const reasons = new Map<string, number>();
  const examples: Array<{ id: string; title: string; status: string; askEuro: number | null; maxSellEuro: number | null; reason: string }> = [];
  for (const ad of ads) {
    const specs = Object.fromEntries((ad.product?.specs ?? []).filter((s) => s.value !== "onbekend").map((s) => [s.key, { value: /^\d+(\.\d+)?$/.test(s.value) ? Number(s.value) : s.value }]));
    const { input } = buildVerdictInput({ ad, rec: { modelKey: ad.product!.modelKey, modelLabel: ad.product!.modelLabel, family: ad.product!.family, facts: specs }, shipping: (ad.shippingOptions as string[]) ?? [] });
    const v = evaluateRules(input, loaded.prices, cfg, loaded.filters);
    counts[v.status]++;
    const reason = v.reasons[0] ?? v.notes[0] ?? "";
    if (v.status === "reject" && reason) reasons.set(reason.replace(/[\d.,]+/g, "#"), (reasons.get(reason.replace(/[\d.,]+/g, "#")) ?? 0) + 1);
    if (examples.length < 25 && v.status !== "skip") examples.push({ id: ad.id, title: ad.title.slice(0, 80), status: v.status, askEuro: v.effectiveEuro ?? v.askEuro ?? v.bidEuro, maxSellEuro: v.maxSellEuro, reason });
  }
  return { total: ads.length, counts, topRejectReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, n]) => ({ reason, n })), examples };
});
