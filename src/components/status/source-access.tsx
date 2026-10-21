import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { SourceMonitor } from "@/lib/source-monitor";

const date = (at: string | null) => at ? new Date(at).toLocaleString("nl-NL", {
  timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
}) : "Nog niet gemeten";

export function SourceAccess({ monitor }: { monitor: SourceMonitor }) {
  return (
    <section aria-label="Marktplaats-toegang" className="space-y-4">
      <div className="rounded-2xl bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Worden we geblokkeerd?</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Hieronder staat wat de bron werkelijk teruggeeft. HTTP 429 betekent een requestlimiet;
          HTTP 403 betekent geweigerde toegang. Een IP-ban is daarmee niet bewezen.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={monitor.worker.healthy ? "success" : "warning"}>
            {monitor.worker.healthy ? "Worker actief" : "Geen recente worker-heartbeat"}
          </Badge>
          <span className="text-muted">Heartbeat: {date(monitor.worker.at)}</span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {monitor.sources.map(source => (
          <article key={source.id} aria-label={source.label} className="min-w-0 rounded-2xl bg-card p-5 sm:p-6">
            <h3 className="font-semibold">{source.label}</h3>
            <div className="mt-3"><Badge tone={source.tone}>{source.title}{source.httpStatus ? ` · HTTP ${source.httpStatus}` : ""}</Badge></div>
            <p className="mt-3 text-sm text-muted">{source.detail}</p>
            <dl className="mt-5 grid gap-3 text-sm">
              <div><dt className="text-muted">Laatste geslaagde zoekcontrole</dt><dd className="mt-0.5 tabular">{date(source.lastSuccessAt)}</dd></div>
              <div><dt className="text-muted">Laatste fout- of pauzesignaal</dt><dd className="mt-0.5 tabular">{date(source.lastIncidentAt)}</dd></div>
              {source.pauseUntil ? <div><dt className="text-muted">Opnieuw proberen op zijn vroegst</dt><dd className="mt-0.5 tabular">{date(source.pauseUntil)}</dd></div>
                : source.state === "unauthorized" || (source.state === "forbidden" && source.id === "marktplaats-official")
                  ? <div><dt className="text-muted">Herstel</dt><dd>Eigen OAuth-token of toegangsrechten controleren.</dd></div> : null}
              <div><dt className="text-muted">Requestbudget</dt><dd>Maximaal {source.requestLimit} per minuut{source.intervalSeconds ? ` · doelinterval ${source.intervalSeconds} s` : ""}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted">
        Bijgewerkt {date(monitor.generatedAt)} · Elke 15 seconden ververst zolang dit scherm zichtbaar is.
        Dit scherm leest alleen opgeslagen metingen en verstuurt geen extra Marktplaats-requests.{" "}
        <Link href="/performance" className="font-medium underline">Bekijk snelheid en meetgegevens</Link>
      </p>
    </section>
  );
}
