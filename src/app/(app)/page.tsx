import Link from "next/link";
import { ArrowRight, BellRing, MapPin } from "lucide-react";
import { NewestDealsCard } from "@/components/dashboard/deals-table";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { STAT_ICONS, StatTile } from "@/components/dashboard/parts";
import { prisma } from "@/lib/db/client";
import { getDashboard } from "@/lib/dashboard";
import { formatEuro } from "@/lib/format";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [d, cfg] = await Promise.all([getDashboard(), getConfig()]);
  const ads = await prisma.advertisement.findMany({
    where: { id: { in: d.newest.map((r) => r.adId) } },
    select: { id: true, url: true },
  });
  const urls = Object.fromEntries(ads.map((a) => [a.id, a.url]));
  const s = d.stats;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">iSelectStore · Deal Hunter</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight sm:text-[42px]">Inkoopradar</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <MapPin className="h-4 w-4" />Apeldoorn · 40 km ophalen · alleen vertrouwd verzenden daarbuiten
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings#push" className="inline-flex h-10 items-center gap-2 rounded-full border border-card-border bg-card px-4 text-sm font-medium hover:shadow-card">
            <BellRing className="h-4 w-4" />Pushmeldingen
          </Link>
          <Link href="/deals?sort=new" className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white">
            Alle deals <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Inkoopoverzicht">
        <StatTile title="Kansen vandaag" value={String(s.newDeals.value)} delta={s.newDeals.delta} deltaLabel="t.o.v. gisteren" icon={STAT_ICONS.newDeals} series={s.newDeals.series} />
        <StatTile title="Gem. verwachte winst" value={formatEuro(s.margin.value)} delta={s.margin.delta} deltaLabel="t.o.v. vorige week" icon={STAT_ICONS.margin} series={s.margin.series} />
        <StatTile title="Zoekopdrachten" value={String(s.profiles.value)} sub={s.profiles.sub} icon={STAT_ICONS.profiles} series={s.profiles.series} />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <NewestDealsCard rows={d.newest} topScore={cfg.scoring.bands.top} urls={urls} />
        <LiveFeed initial={d.feed.slice(0, 4)} />
      </div>
    </div>
  );
}
