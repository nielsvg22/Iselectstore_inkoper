import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import { RunNow } from "@/components/status/run-now";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, timeAgo } from "@/lib/format";
import { getStatus } from "@/lib/status";
import { SourceAccess } from "@/components/status/source-access";
import { AutoRefresh } from "@/components/radar-refresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status" };

export default async function StatusPage() {
  const s = await getStatus();
  const jobs = s.jobs as Record<string, number>;
  const pending = (jobs.PENDING ?? 0) + (jobs.RUNNING ?? 0);
  const failed = (jobs.FAILED ?? 0) + (jobs.DEAD ?? 0);
  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={15000} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Status</h1>
          <p className="mt-1 text-muted">Draait alles? Zie bronnen, zoekprofielen, wachtrij en fouten.</p>
        </div>
        <RunNow />
      </div>

      <SourceAccess monitor={s.access} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Samenvatting">
        {[
          ["Geanalyseerde advertenties", String(s.processedAds)],
          ["In wachtrij", String(pending)],
          ["Mislukte jobs", String(failed)],
          ["Laatste job gereed", timeAgo(s.lastJobFinishedAt)],
        ].map(([l, v]) => (
          <Card key={l} className="p-5"><p className="text-[13px] font-medium text-muted">{l}</p><p className="tabular mt-2 text-2xl font-semibold tracking-tight">{v}</p></Card>
        ))}
      </section>
      {pending > 0 && !s.lastJobFinishedAt && <p className="text-sm text-muted">Er staan jobs in de wachtrij. Draait de worker (<code>npm run worker</code>) of is de cron-aanroep ingesteld? Gebruik anders ‘Nu verwerken’.</p>}

      <Card>
        <CardHeader><div><CardTitle>Databronnen</CardTitle><CardDescription>Geregistreerde broncontroles. De actuele Marktplaats-toegang en het requestbudget staan hierboven.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          {s.sources.map((src) => (
            <div key={src.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted-bg px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                {!src.enabled ? <CircleDashed className="h-5 w-5 text-muted" /> : src.ok === false ? <CircleAlert className="h-5 w-5 text-danger" /> : src.ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <CircleDashed className="h-5 w-5 text-muted" />}
                <div className="min-w-0"><p className="font-medium">{src.label}</p><p className="truncate text-xs text-muted">{!src.enabled ? "Uitgeschakeld in instellingen" : src.ok === false ? `Fout: ${src.lastError}` : src.ok ? `Laatst gelukt ${timeAgo(src.lastOkAt)}` : "Nog niet gebruikt"}</p></div>
              </div>
              <span className="tabular text-xs text-muted">{src.requestsToday} requests vandaag</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Zoekprofielen</CardTitle><CardDescription>Actieve profielen en hun laatste controle.</CardDescription></div></CardHeader>
        <CardContent>
          {s.profiles.length === 0 ? <p className="text-sm text-muted">Geen zoekprofielen.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="pb-2 font-medium">Profiel</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Laatste controle</th><th className="pb-2 text-right font-medium">Ontdekt</th><th className="pb-2 text-right font-medium">Interessant</th></tr></thead>
                <tbody className="divide-y divide-card-border">
                  {s.profiles.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 font-medium">{p.name}{p.lastError && <p className="mt-0.5 max-w-xs truncate text-xs font-normal text-danger" title={p.lastError}>{p.lastError}</p>}</td>
                      <td className="py-2.5"><Badge tone={!p.active ? "neutral" : p.lastError ? "danger" : "success"}>{!p.active ? "Gepauzeerd" : p.lastError ? "Fout" : "Actief"}</Badge></td>
                      <td className="py-2.5 text-muted" title={formatDate(p.lastCheckedAt)}>{timeAgo(p.lastCheckedAt)}</td>
                      <td className="tabular py-2.5 text-right">{p.discoveredCount}</td>
                      <td className="tabular py-2.5 text-right font-semibold text-success">{p.interestingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Recente fouten</CardTitle><CardDescription>Laatste jobfouten (zonder geheimen).</CardDescription></div></CardHeader>
          <CardContent>
            {s.recentErrors.length === 0 ? <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />Geen fouten geregistreerd.</p> : (
              <ul className="space-y-3">
                {s.recentErrors.map((e) => (
                  <li key={e.id} className="text-sm"><div className="flex items-center gap-2"><Badge tone={e.status === "PENDING" ? "warning" : "danger"}>{e.type}</Badge><span className="text-xs text-muted">{timeAgo(e.createdAt)} · poging {e.attempts}</span></div><p className="mt-1 break-words text-foreground/80">{e.lastError}</p></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>AI &amp; integraties</CardTitle><CardDescription>Kostenbewaking en configuratie.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">AI-provider</span><span className="font-medium">{s.ai.provider === "none" ? "Uit (alleen regels)" : s.ai.provider}</span></div>
            <div className="flex justify-between"><span className="text-muted">AI-aanroepen vandaag</span><span className="tabular font-medium">{s.ai.calls} / {s.ai.maxCalls}</span></div>
            <div className="flex justify-between"><span className="text-muted">Geschatte AI-kosten vandaag</span><span className="tabular font-medium">€{s.ai.costEur.toFixed(2)} / €{s.ai.maxCostEur.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Telegram</span><Badge tone={s.secrets["telegram.botToken"] ? "success" : "neutral"}>{s.secrets["telegram.botToken"] ? "Token ingesteld" : "Niet ingesteld"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted">Discord</span><Badge tone={s.secrets["discord.webhookUrl"] ? "success" : "neutral"}>{s.secrets["discord.webhookUrl"] ? "Webhook ingesteld" : "Niet ingesteld"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted">Mislukte analyses</span><span className="tabular font-medium">{s.failedAds}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
