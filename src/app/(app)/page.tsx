import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CategoryCard, CategoryChips, CtaBanner, STAT_ICONS, StatTile } from "@/components/dashboard/parts";
import { NewestDealsCard } from "@/components/dashboard/deals-table";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { prisma } from "@/lib/db/client";
import { getDashboard } from "@/lib/dashboard";
import { formatEuro } from "@/lib/format";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const cat = Array.isArray(sp.cat) ? sp.cat[0] : sp.cat;
  const [d, cfg] = await Promise.all([getDashboard(cat), getConfig()]);
  const ads = await prisma.advertisement.findMany({ where: { id: { in: d.newest.map((r) => r.adId) } }, select: { id: true, url: true } });
  const urls = Object.fromEntries(ads.map((a) => [a.id, a.url]));
  const topScore = cfg.scoring.bands.top;
  const s = d.stats;
  return (
    <div className="space-y-8">
      <CategoryChips active={cat ?? ""} />
      <section aria-label="Kerncijfers" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile title="Nieuwe deals" value={String(s.newDeals.value)} delta={s.newDeals.delta} deltaLabel="t.o.v. gisteren" icon={STAT_ICONS.newDeals} series={s.newDeals.series} sub="nog geen vergelijking" />
        <StatTile title="Gemiddelde marge" value={formatEuro(s.margin.value)} delta={s.margin.delta} deltaLabel="t.o.v. vorige week" icon={STAT_ICONS.margin} series={s.margin.series} sub="nog geen vergelijking" />
        <StatTile title="Actieve zoekopdrachten" value={String(s.profiles.value)} sub={s.profiles.sub} icon={STAT_ICONS.profiles} series={s.profiles.series} />
        <StatTile title="Prijsverschil" value={s.priceDiff.value == null ? "–" : `${s.priceDiff.value > 0 ? "+" : ""}${s.priceDiff.value}%`} sub="gem. t.o.v. marktprijs" icon={STAT_ICONS.priceDiff} series={s.priceDiff.series} />
      </section>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section aria-label="Populaire categorieën">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold tracking-tight">Populaire categorieën</h2>
              <Link href="/deals" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-strong hover:underline">Bekijk alle categorieën <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 2xl:grid-cols-5">
              {d.categories.map((c) => <CategoryCard key={c.id} {...c} />)}
            </div>
          </section>
          <NewestDealsCard rows={d.newest} topScore={topScore} urls={urls} />
        </div>
        <LiveFeed initial={d.feed.slice(0, 4)} />
      </div>
      <CtaBanner />
    </div>
  );
}
