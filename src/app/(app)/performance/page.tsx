import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { diagnose } from "@/lib/diagnose";
import { getPerformance, type Dist } from "@/lib/metrics";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prestaties" };

const fmt = (s: number | null) => (s == null ? "—" : s < 90 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : s < 5400 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(1)} uur`);
const ago = (s: number | null) => (s == null ? "nog nooit" : s < 60 ? "zojuist" : s < 3600 ? `${Math.round(s / 60)} min geleden` : `${(s / 3600).toFixed(1)} uur geleden`);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" }) {
  return (
    <div className="rounded-[24px] bg-card p-6 shadow-card">
      <p className="text-[14px] font-medium text-muted">{label}</p>
      <p className={`tabular mt-3 text-[28px] font-semibold leading-none ${tone === "bad" ? "text-danger" : ""}`}>{value}</p>
      {sub && <p className="mt-4 text-[13px] text-faint">{sub}</p>}
    </div>
  );
}

const LAT: Array<[keyof Awaited<ReturnType<typeof getPerformance>>["latency"], string, string]> = [
  ["prefilter", "Eerste detectie → snelle voorselectie", "gemeten"],
  ["fullAnalysis", "Eerste detectie → volledige analyse", "gemeten"],
  ["toNotification", "Eerste detectie → melding aangemaakt", "gemeten"],
  ["push", "Melding aangemaakt → verzonden naar dienst", "gemeten"],
  ["endToEnd", "Eerste detectie → verzonden (totaal)", "gemeten"],
];

export default async function PerformancePage() {
  const user = await getCurrentUser();
  const [d, checks] = await Promise.all([getPerformance(7), diagnose(user!.id)]);
  const max = Math.max(1, ...d.adsPerHour.map((h) => h.count));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[30px] font-bold tracking-tight sm:text-[36px]">Prestaties</h1>
        <p className="mt-1 max-w-3xl text-muted">Gemeten snelheid van de detectieketen. Tijden beginnen bij de <strong>eerste detectie door onze scraper</strong>; de publicatietijd van Marktplaats is te grof (alleen dag) om als meting te gebruiken.</p>
      </div>

      <section aria-label="Waarom geen melding?" className="rounded-[24px] bg-card p-6 shadow-card sm:p-8">
        <h2 className="text-[18px] font-semibold tracking-tight">Waarom krijg ik (nog) geen melding?</h2>
        <p className="mt-1 text-sm text-muted">Loopt de hele keten na: apparaat → voorkeuren → scraper → nulmeting → meldingen.</p>
        <ul className="mt-5 divide-y divide-card-border">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-3 py-3.5">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${c.status === "ok" ? "bg-success" : c.status === "warn" ? "bg-warning" : "bg-danger"}`} aria-label={c.status === "ok" ? "in orde" : c.status === "warn" ? "let op" : "probleem"} />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{c.title}</p>
                <p className="text-muted">{c.detail}</p>
                {c.action && <p className="mt-1 font-medium text-foreground/80">→ {c.action}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {d.cooldown && (
        <div role="alert" className="rounded-2xl bg-danger-soft px-5 py-4 text-sm"><strong>Gepauzeerd door Marktplaats-blokkade tot {new Date(d.cooldown.until).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}.</strong> {d.cooldown.reason} De app probeert het daarna rustig opnieuw en omzeilt de blokkade niet.</div>
      )}
      {d.fast.enabled && <p className="text-sm text-muted">Snelle modus aan: {d.fast.profiles} profiel{d.fast.profiles === 1 ? "" : "en"} elke ±{d.fast.intervalSeconds} s.</p>}
      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kerncijfers">
        <Tile label="Laatste succesvolle controle" value={ago(d.lastSuccessSeconds)} sub={`${d.activeProfiles} actieve zoekprofielen`} />
        <Tile label="Nieuwe advertenties (24 uur)" value={String(d.newAds24h)} sub="eerste keer gezien" />
        <Tile label="Gemiste of mislukte controles" value={`${d.checks24h.missed} / ${d.checks24h.failed}`} sub={`achterstallig / mislukt (24 uur, van ${d.checks24h.total})`} tone={d.checks24h.missed + d.checks24h.failed > 0 ? "bad" : undefined} />
        <Tile label="Tijd tot melding (p95)" value={fmt(d.latency.endToEnd.p95)} sub={`gemiddeld ${fmt(d.latency.endToEnd.avg)} · ${d.latency.endToEnd.n} meldingen`} />
      </section>

      <Card>
        <CardHeader><div><CardTitle>Nieuwe advertenties per uur</CardTitle><CardDescription>Laatste 24 uur, op basis van eerste detectie.</CardDescription></div></CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Nieuwe advertenties per uur">
            {d.adsPerHour.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${h.hour.slice(11)}:00 — ${h.count}`}>
                <div className="w-full rounded-t-md bg-accent/80" style={{ height: `${Math.max(2, (h.count / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint"><span>24 u geleden</span><span>nu</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Verwerkingstijden (laatste 7 dagen)</CardTitle><CardDescription>Seconden/minuten tussen stappen. p95 = 95% is sneller dan deze waarde.</CardDescription></div></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-[12px] font-medium uppercase tracking-wide text-faint"><th className="pb-3 pr-4">Stap</th><th className="pb-3 pr-4">Aantal</th><th className="pb-3 pr-4">Gemiddeld</th><th className="pb-3 pr-4">Mediaan</th><th className="pb-3 pr-4">p95</th><th className="pb-3">Type</th></tr></thead>
            <tbody>
              {LAT.map(([k, label, type]) => {
                const x: Dist = d.latency[k];
                return (
                  <tr key={k} className="border-t border-card-border"><td className="py-3 pr-4 font-medium">{label}</td><td className="tabular py-3 pr-4">{x.n}</td><td className="tabular py-3 pr-4">{fmt(x.avg)}</td><td className="tabular py-3 pr-4">{fmt(x.p50)}</td><td className="tabular py-3 pr-4">{fmt(x.p95)}</td><td className="py-3 text-muted">{type}</td></tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-5 rounded-2xl bg-muted-bg p-4 text-sm text-muted">
            <p><strong className="text-foreground">Geschatte maximale detectievertraging: {d.estimatedMaxDetectionDelayMinutes == null ? "—" : d.estimatedMaxDetectionDelayMinutes < 3 ? `≈ ${Math.round(d.estimatedMaxDetectionDelayMinutes * 60)} s` : `≈ ${d.estimatedMaxDetectionDelayMinutes.toFixed(0)} min`}</strong> <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium">schatting</span></p>
            <p className="mt-1">Dit is het kortste controle-interval van een actief profiel plus de gemeten verwerkingstijd. We controleren periodiek; dit is dus geen realtime-garantie. Een advertentie die buiten de opgehaalde zoekpagina’s valt, wordt pas later gezien.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Zoekprofielen</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.profiles.length === 0 && <p className="text-sm text-muted">Nog geen zoekprofielen.</p>}
            {d.profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted-bg px-4 py-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{p.name}{!p.active && <span className="ml-2 text-xs text-muted">(gepauzeerd)</span>}</p><p className="truncate text-xs text-muted">{p.lastError ? `Fout: ${p.lastError}` : `elke ${p.intervalMinutes} min`}</p>{p.rounds && <p className="text-xs text-muted">Rondlopend: {p.rounds.slices} smalle lijsten ({p.rounds.seen} al bekeken, ±{p.rounds.pages} pagina’s). Prioriteitsmodellen ±{p.rounds.highRoundMin == null ? "—" : Math.round(p.rounds.highRoundMin)} min per ronde, alles ±{Math.round(p.rounds.fullRoundMin)} min.</p>}{p.coverage && !p.rounds && <p className={`text-xs ${p.coverage.pct < 70 ? "font-medium text-danger" : "text-muted"}`}>Dekking: {p.coverage.covered} van {p.coverage.total} resultaten gezien ({p.coverage.pct}%){p.coverage.pct < 70 ? " — maak de zoekopdracht specifieker (categorie, model, opslag) of verhoog het aantal pagina’s; nieuwe advertenties kunnen anders gemist worden" : ""}</p>}</div>
                <span className={`shrink-0 text-xs ${p.overdue ? "font-semibold text-danger" : "text-muted"}`}>{p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "nooit"}{p.overdue ? " · achterstallig" : ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Wachtrij &amp; meldingen</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-muted">Jobs in wachtrij</p><p className="tabular mt-1 text-[22px] font-semibold">{d.queue.pending}</p></div>
            <div><p className="text-muted">Mislukt/dood</p><p className="tabular mt-1 text-[22px] font-semibold">{d.queue.dead}</p></div>
            <div><p className="text-muted">Verzonden (7 d)</p><p className="tabular mt-1 text-[22px] font-semibold">{d.notifications7d.sent}</p></div>
            <div><p className="text-muted">Mislukt (7 d)</p><p className="tabular mt-1 text-[22px] font-semibold">{d.notifications7d.failed}</p></div>
            <div className="col-span-2 text-xs text-faint">Gemiddelde controleduur {d.checks24h.avgDurationMs == null ? "—" : fmt(d.checks24h.avgDurationMs / 1000)} · cache-treffers {d.checks24h.cacheHitPct == null ? "—" : `${d.checks24h.cacheHitPct.toFixed(0)}%`} (gedeelde zoekpagina’s)</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
