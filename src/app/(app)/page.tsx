import { Flame, Hourglass, Percent, ShieldQuestion, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DealCard, type DealRow } from "@/components/deal/deal-card";
import { DealTable } from "@/components/deal/deal-table";
import { FiltersBar } from "@/components/deal/filters-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { getCurrentUser } from "@/lib/auth";
import type { Group } from "@/lib/engines/filters";
import { prisma } from "@/lib/db/client";
import { formatEuro, formatPct } from "@/lib/format";
import { dashboardStats, listDeals } from "@/lib/queries";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function StatCard({ icon: Icon, label, value, sub, tone }: { icon: typeof Flame; label: string; value: string; sub?: string; tone?: "accent" | "success" | "warning" }) {
  const c = tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${c}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="tabular mt-3 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

async function Stats() {
  const s = await dashboardStats();
  return (
    <section aria-label="Kerncijfers" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard icon={Sparkles} label="Nieuw (24 uur)" value={String(s.newAds)} sub={`${s.totalAds} advertenties in totaal`} />
      <StatCard icon={Flame} label="Interessante deals" value={String(s.interesting)} sub="boven je minimumscore" tone="success" />
      <StatCard icon={Wallet} label="Potentiële winst" value={formatEuro(s.totalProfit)} sub={s.interesting ? `conservatief ${formatEuro(s.conservativeProfit)}${s.uncertainCount ? ` · ${s.uncertainCount} onzeker` : ""}` : "geen deals"} tone="success" />
      <StatCard icon={Percent} label="Gemiddeld rendement" value={formatPct(s.avgRoi, 0)} sub="op inkoopprijs" />
      <StatCard icon={ShieldQuestion} label="Controle vereist" value={String(s.review)} sub="handmatig beoordelen" tone="warning" />
    </section>
  );
}

async function Deals({ sp, userId }: { sp: Awaited<SP>; userId: string }) {
  const cfg = await getConfig();
  const filterId = one(sp.filter);
  const saved = filterId ? await prisma.savedFilter.findFirst({ where: { id: filterId, userId } }) : null;
  const sort = one(sp.sort) as never;
  const { rows, total } = await listDeals({
    q: one(sp.q),
    band: one(sp.band),
    family: one(sp.family),
    profileId: one(sp.profile),
    savedTree: saved ? (saved.tree as unknown as Group) : undefined,
    review: one(sp.review) === "1",
    showBlocked: one(sp.blocked) === "1",
    sort: sort ?? "score",
    limit: 60,
    offset: Number(one(sp.offset) ?? 0) || 0,
  });
  const data: DealRow[] = rows.map((a) => ({
    adId: a.adId,
    title: a.ad.title,
    model: a.ad.product?.modelLabel ?? null,
    image: a.ad.images[0]?.url ?? null,
    askingCents: a.askingCents,
    expectedCents: a.expectedCents,
    netProfitCents: a.netProfitCents,
    conservativeProfitCents: a.conservativeProfitCents,
    roiPct: a.roiPct,
    maxBidCents: a.maxBidCents,
    score: a.score,
    band: a.band,
    blocked: a.blocked,
    uncertain: a.uncertain,
    risk: a.ad.risk?.level ?? null,
    needsReview: a.ad.needsManualReview,
    location: a.ad.location,
    distanceKm: a.ad.distanceKm,
    firstSeenAt: a.ad.firstSeenAt.toISOString(),
    isDemo: a.ad.isDemo,
    url: a.ad.url,
    priceKnown: a.ad.askingPriceCents != null && a.ad.askingPriceCents > 0,
  }));
  const filtered = Boolean(one(sp.q) || one(sp.band) || one(sp.family) || one(sp.profile) || one(sp.review) || saved);
  if (!data.length) {
    const any = await prisma.advertisement.count({ where: { isDemo: cfg.demoMode } });
    return filtered ? (
      <EmptyState title="Geen deals gevonden met deze filters" description="Pas de filters aan of wis ze om alle deals te zien." action={<Link href="/"><Button variant="outline">Filters wissen</Button></Link>} />
    ) : any ? (
      <EmptyState title="Advertenties worden nog geanalyseerd" description="Er staan advertenties in de wachtrij. Ververs de pagina zodra de analyse klaar is (zie Status)." action={<Link href="/status"><Button>Naar status</Button></Link>} />
    ) : (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title="Nog geen advertenties"
        description="Importeer een Marktplaats-advertentie via URL, plak een geautoriseerde export, of verken de app eerst met duidelijk gemarkeerde voorbeelddata."
        action={
          <>
            <Link href="/import"><Button>Advertenties importeren</Button></Link>
            <Link href="/profiles/new"><Button variant="outline">Zoekprofiel maken</Button></Link>
          </>
        }
      />
    );
  }
  const view = one(sp.view) === "table" ? "table" : "cards";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" aria-live="polite">{total} {total === 1 ? "deal" : "deals"}{saved ? ` volgens je filter “${saved.name}”` : ""}{total > data.length ? ` · eerste ${data.length} getoond` : ""}</p>
      {view === "table" ? <DealTable rows={data} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map((d) => <DealCard key={d.adId} d={d} />)}</div>}
    </div>
  );
}

function DealsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Deals laden">
      {[0, 1, 2].map((i) => (<Card key={i} className="overflow-hidden"><Skeleton className="h-44 rounded-none" /><div className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-16 w-full" /></div></Card>))}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const [profiles, savedFilters] = await Promise.all([
    prisma.searchProfile.findMany({ where: { userId: user!.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.savedFilter.findMany({ where: { userId: user!.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted"><Hourglass className="h-3.5 w-3.5" />Overzicht</div>
        <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">Beste deals van dit moment</h1>
        <p className="mt-1 max-w-2xl text-muted">Gerangschikt op verwachte, realistische winst. Controleer risico&apos;s en het maximale bod voordat je contact opneemt.</p>
      </div>
      <Suspense fallback={<div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div>}>
        <Stats />
      </Suspense>
      <section className="space-y-4" aria-label="Deals">
        <Suspense fallback={<Skeleton className="h-11" />}>
          <FiltersBar profiles={profiles} savedFilters={savedFilters} />
        </Suspense>
        <Suspense key={JSON.stringify(sp)} fallback={<DealsSkeleton />}>
          <Deals sp={sp} userId={user!.id} />
        </Suspense>
      </section>
    </div>
  );
}
