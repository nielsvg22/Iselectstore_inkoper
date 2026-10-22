import type { Metadata } from "next";
import Link from "next/link";
import { MNumbersForm } from "@/components/rules/mnumbers-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { funnelStats, offerOverview } from "@/lib/funnel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Funnel & aanbod" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const delta = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? "" : cur - prev === 0 ? "±0" : `${cur - prev > 0 ? "+" : ""}${cur - prev}`);
const eur = (n: number | null) => (n == null ? "—" : `€${n}`);

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = [7, 14, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const user = await getCurrentUser();
  const [f, o] = await Promise.all([funnelStats(user!.role === "ADMIN" ? null : user!.id, days), offerOverview(Math.min(days, 30))]);
  const weak = f.rows.filter((r) => r.sent >= 3 && r.opened / r.sent < 0.75);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Funnel &amp; aanbod</h1>
        <p className="mt-1 text-muted">Wat gebeurt er met de meldingen: verstuurd, geopend, doorgeklikt, gekocht — en hoeveel aanbod er per model binnenkomt.</p>
        <div className="mt-3 flex gap-2">{[7, 14, 30, 90].map((d) => <Link key={d} href={`/funnel?days=${d}`} className={`rounded-full px-3 py-1 text-sm ${d === days ? "bg-accent-soft text-accent" : "bg-muted-bg text-muted"}`}>{d} dagen</Link>)}</div>
      </div>

      <Card>
        <CardHeader><div><CardTitle>Funnel per model</CardTitle><CardDescription>{f.totals.sent} meldingen · {pct(f.totals.opened, f.totals.sent)} geopend · {pct(f.totals.clicked, f.totals.sent)} doorgeklikt · {f.totals.bought} gekocht</CardDescription></div></CardHeader>
        <CardContent>
          {f.rows.length === 0 ? <p className="text-sm text-muted">Nog geen verstuurde meldingen in deze periode.</p> : (
            <div className="overflow-auto"><table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2">Model</th><th>Verstuurd</th><th>Geopend</th><th>Doorgeklikt</th><th>Gekocht</th></tr></thead>
              <tbody>{f.rows.map((r) => <tr key={r.modelKey} className="border-t border-card-border"><td className="py-1.5">{r.label}</td><td>{r.sent}</td><td>{r.opened} <span className="text-muted">({pct(r.opened, r.sent)})</span></td><td>{r.clicked} <span className="text-muted">({pct(r.clicked, r.sent)})</span></td><td>{r.bought}</td></tr>)}</tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      {weak.length > 0 && (
        <Card>
          <CardHeader><div><CardTitle>Weinig geopend</CardTitle><CardDescription>Modellen waarvan minder dan 75% van de meldingen is geopend. Overweeg het filter voor deze modellen aan te scherpen.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            {weak.map((r) => (
              <div key={r.modelKey}>
                <p className="text-sm font-semibold">{r.label}: {r.sent - r.opened}/{r.sent} niet geopend</p>
                <ul className="mt-1 space-y-0.5 text-sm text-muted">
                  {f.unopened.filter((u) => u.modelKey === r.modelKey).slice(0, 5).map((u) => <li key={u.adId}><Link className="hover:underline" href={`/ads/${u.adId}`}>{u.title}</Link> — {u.askEuro != null ? `vraagprijs ${eur(u.askEuro)}` : u.bidEuro != null ? `bieden vanaf ${eur(u.bidEuro)}` : "geen prijs"}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><div><CardTitle>Aanbod per model</CardTitle><CardDescription>Laatste {o.periodDays} dagen, met verschil t.o.v. de {o.periodDays} dagen daarvoor. Zo zie je eerder wanneer een filter te ruim of te strak staat.</CardDescription></div></CardHeader>
        <CardContent>
          {o.rows.length === 0 ? <p className="text-sm text-muted">Nog geen advertenties in deze periode.</p> : (
            <div className="overflow-auto"><table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2">Model</th><th>Ontvangen</th><th>Met prijs</th><th>Bieden vanaf 0</th><th>Gem. vraagprijs</th><th>Gem. bieden vanaf</th></tr></thead>
              <tbody>{o.rows.map((r) => <tr key={r.modelKey} className="border-t border-card-border">
                <td className="py-1.5">{r.label}</td>
                <td>{r.received} <span className="text-muted">{delta(r.received, r.prev.received)}</span></td>
                <td>{r.withPrice} <span className="text-muted">{delta(r.withPrice, r.prev.withPrice)}</span></td>
                <td>{r.bidZero} <span className="text-muted">{delta(r.bidZero, r.prev.bidZero)}</span></td>
                <td>{eur(r.avgAsk)} <span className="text-muted">{delta(r.avgAsk, r.prev.avgAsk)}</span></td>
                <td>{eur(r.avgBid)} <span className="text-muted">{delta(r.avgBid, r.prev.avgBid)}</span></td></tr>)}</tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Gelogde gegevens</CardTitle><CardDescription>Wat de bron per advertentie echt levert — handig om filters op te baseren.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>Verkoper met beoordeling: {o.sellerSignals.withRating}/{o.sellerSignals.total}</Badge>
            <Badge>Verkoper met accountleeftijd: {o.sellerSignals.withAge}/{o.sellerSignals.total}</Badge>
            {Object.entries(o.mpConditions).map(([k, n]) => <Badge key={k}>Conditie “{k}”: {n}</Badge>)}
          </div>
          {o.rows.length > 0 && (
            <div className="overflow-auto"><table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2">Batterij per model</th><th>&lt;80%</th><th>80–84</th><th>85–89</th><th>90–94</th><th>95–100</th><th>onbekend</th></tr></thead>
              <tbody>{o.rows.slice(0, 20).map((r) => <tr key={r.modelKey} className="border-t border-card-border"><td className="py-1.5">{r.label}</td>{(["<80", "80-84", "85-89", "90-94", "95-100", "onbekend"] as const).map((k) => <td key={k}>{r.battery[k]}</td>)}</tr>)}</tbody>
            </table></div>
          )}
          <MNumbersForm />
        </CardContent>
      </Card>
    </div>
  );
}
