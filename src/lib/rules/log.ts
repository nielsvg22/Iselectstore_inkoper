import { prisma } from "@/lib/db/client";
import { prefilterStats } from "./prefilter-stats";
import { STEPS } from "./steps";

export interface FilterLogRow {
  adId: string;
  at: string;
  title: string;
  source: string;
  askEuro: number | null;
  status: string;
  step: string | null;
  stepTitle: string | null;
  reason: string;
  flags: string[];
  profitEuro: number | null;
}

export interface FilterLog {
  rows: FilterLogRow[];
  /** aantal afgewezen advertenties per stap (waarom uitgesloten) */
  byStep: Array<{ step: string; title: string; n: number }>;
  byStatus: Record<string, number>;
  /** al bij het ophalen weggelaten (vandaag), per platform en reden */
  dropped: Record<string, Record<string, number>>;
}

/** Waarom advertenties wel of niet zijn doorgelaten: het opgeslagen oordeel van de regelmotor bij de laatste analyse. */
export async function filterLog(opts: { platform?: "marktplaats" | "vinted"; status?: string; limit?: number } = {}): Promise<FilterLog> {
  const rows = await prisma.dealAnalysis.findMany({
    where: { isCurrent: true, ad: { isDemo: false, ...(opts.platform ? { source: opts.platform } : {}), duplicateOfId: null } },
    orderBy: { createdAt: "desc" },
    take: Math.min(500, opts.limit ?? 200),
    select: { adId: true, createdAt: true, askingCents: true, costs: true, ad: { select: { title: true, source: true } } },
  });
  const title = new Map(STEPS.map((s) => [s.id as string, s.title]));
  const out: FilterLogRow[] = [];
  const byStep = new Map<string, number>();
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    const v = (r.costs as { rules?: { status?: string; decidedBy?: string | null; reasons?: string[]; notes?: string[]; flags?: string[]; profit?: { profitEuro?: number } | null } } | null)?.rules;
    const status = v?.status ?? "geen oordeel";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "reject" && v?.decidedBy) byStep.set(v.decidedBy, (byStep.get(v.decidedBy) ?? 0) + 1);
    if (opts.status && status !== opts.status) continue;
    out.push({
      adId: r.adId, at: r.createdAt.toISOString(), title: r.ad.title, source: r.ad.source, askEuro: r.askingCents != null ? r.askingCents / 100 : null,
      status, step: v?.decidedBy ?? null, stepTitle: v?.decidedBy ? title.get(v.decidedBy) ?? null : null,
      reason: v?.reasons?.[0] ?? (status === "match" || status === "high" ? "Voldoet aan alle ingestelde filters" : v?.notes?.[0] ?? ""),
      flags: v?.flags ?? [], profitEuro: v?.profit?.profitEuro ?? null,
    });
  }
  const dropped = { marktplaats: await prefilterStats("marktplaats"), vinted: await prefilterStats("vinted") };
  return { dropped, rows: out, byStep: [...byStep.entries()].map(([step, n]) => ({ step, title: title.get(step) ?? step, n })).sort((a, b) => b.n - a.n), byStatus };
}
