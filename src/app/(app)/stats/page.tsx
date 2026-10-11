import { ByModel, DealsPerDay } from "@/components/dashboard/stats-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db/client";
import { formatEuro, formatPct } from "@/lib/format";
import { dashboardStats } from "@/lib/queries";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";
const DAY = 86400000;

export default async function StatsPage() {
  const cfg = await getConfig();
  const s = await dashboardStats();
  const since = new Date(Date.now() - 14 * DAY);
  const rows = await prisma.dealAnalysis.findMany({
    where: { isCurrent: true, blocked: false, ad: { isDemo: cfg.demoMode, duplicateOfId: null, firstSeenAt: { gte: since } } },
    select: { score: true, ad: { select: { firstSeenAt: true, product: { select: { modelLabel: true } } } } },
    take: 10000,
  });
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY);
    return { key: d.toDateString(), day: d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }), deals: 0, interesting: 0 };
  });
  const models = new Map<string, number>();
  for (const r of rows) {
    const b = days.find((d) => d.key === r.ad.firstSeenAt.toDateString());
    if (b) { b.deals++; if (r.score >= cfg.targets.minDealScore) b.interesting++; }
    const m = r.ad.product?.modelLabel;
    if (m && r.score >= cfg.targets.minDealScore) models.set(m, (models.get(m) ?? 0) + 1);
  }
  const top = [...models].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
  return (
    <div className="space-y-6">
      <h1 className="text-[30px] font-bold tracking-tight sm:text-[36px]">Statistieken</h1>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Kerncijfers">
        {[["Advertenties", String(s.totalAds)], ["Interessante deals", String(s.interesting)], ["Potentiële winst", formatEuro(s.totalProfit)], ["Gem. rendement", formatPct(s.avgRoi, 0)]].map(([l, v]) => (
          <div key={l} className="rounded-[22px] bg-card p-5 shadow-card"><p className="text-[15px] font-semibold text-muted">{l}</p><p className="tabular mt-2 text-[30px] font-bold leading-none">{v}</p></div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Advertenties per dag (14 dagen)</CardTitle></CardHeader><CardContent><DealsPerDay data={days} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Interessante deals per model</CardTitle></CardHeader><CardContent><ByModel data={top} /></CardContent></Card>
      </div>
    </div>
  );
}
