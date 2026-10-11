"use client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { formatEuro, timeAgo } from "@/lib/format";
import type { DealRowLite } from "@/lib/dashboard";
import { Thumb } from "./parts";

/** Realtime meldingen: ververst zichzelf elke 30 seconden. */
export function LiveFeed({ initial }: { initial: DealRowLite[] }) {
  const [rows, setRows] = React.useState(initial);
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/dashboard", { headers: { accept: "application/json" } });
        if (r.ok && alive) setRows(((await r.json()) as { feed: DealRowLite[] }).feed.slice(0, 4));
      } catch {
        /* netwerkfout: volgende ronde opnieuw */
      }
    };
    const a = setInterval(load, 30_000);
    const b = setInterval(() => tick((n) => n + 1), 30_000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);
  return (
    <aside className="rounded-[24px] bg-card p-6 shadow-card sm:p-7" aria-label="Realtime meldingen" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold leading-tight tracking-tight">Realtime meldingen</h2>
        <Link href="/notifications" className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-accent-strong hover:underline">Alles bekijken <ArrowRight className="h-4 w-4" /></Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Zodra er nieuwe deals zijn verschijnen ze hier.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r) => {
            const fresh = Date.now() - new Date(r.firstSeenAt).getTime() < 3600_000;
            return (
              <li key={r.adId}>
                <Link href={`/ads/${r.adId}`} className="flex items-center gap-3.5 rounded-2xl px-2 py-3.5 transition hover:bg-muted-bg/60">
                  <Thumb image={r.image} family={r.family} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[14px] font-medium">{r.model}{r.variant ? ` ${r.variant.split(" · ")[0]}` : ""}</span>
                    <span className="tabular mt-0.5 flex items-center gap-2 text-[13px] text-muted">
                      {formatEuro(r.askingCents)}
                      {r.discount != null && r.discount > 0 && <span className="font-medium text-success">−{r.discount}%</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[12px] text-faint">
                    {timeAgo(r.firstSeenAt)}
                    <span className={`h-2 w-2 rounded-full ${fresh ? "live-dot bg-success" : "bg-faint/40"}`} aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
