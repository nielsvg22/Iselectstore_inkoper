"use client";
import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { formatEuro } from "@/lib/format";
import { hiRes } from "@/lib/images";

interface Item {
  id: string;
  adId: string;
  createdAt: string;
  model: string;
  storageGb: number | null;
  askingCents: number | null;
  expectedCents: number;
  netProfitCents: number;
  score: number;
  distanceKm: number | null;
  provisional: boolean;
  reasons: string[];
  externalUrl: string | null;
  image: string | null;
}

const KEY = "adh-popup-cursor";
const MAX = 4;

/** Pop-up bij elke nieuwe advertentie zolang de app open staat (haalt elke paar seconden de nieuwe meldingen op). */
export function LivePopups() {
  const [items, setItems] = React.useState<Item[]>([]);
  const cursor = React.useRef<string>(new Date().toISOString());
  const baseTitle = React.useRef("");

  React.useEffect(() => {
    baseTitle.current = document.title;
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) cursor.current = saved; // binnen dezelfde sessie niets dubbel tonen na navigatie
    } catch {
      /* sessionStorage niet beschikbaar */
    }
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/notify/feed?after=${encodeURIComponent(cursor.current)}`, { headers: { accept: "application/json" }, cache: "no-store" });
        if (!r.ok || !alive) return;
        const d = (await r.json()) as { items: Item[]; now: string };
        if (d.items.length) {
          cursor.current = d.now;
          try {
            sessionStorage.setItem(KEY, d.now);
          } catch {
            /* negeren */
          }
          setItems((cur) => [...cur, ...d.items].slice(-MAX));
          if (navigator.vibrate) navigator.vibrate(120);
        }
      } catch {
        /* netwerkfout: volgende ronde opnieuw */
      }
    };
    void poll();
    const t = setInterval(poll, 5000);
    const vis = () => void poll();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  React.useEffect(() => {
    document.title = items.length ? `(${items.length}) Nieuwe advertentie · ${baseTitle.current}` : baseTitle.current || document.title;
  }, [items.length]);

  const dismiss = (id: string) => setItems((cur) => cur.filter((x) => x.id !== id));
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex flex-col items-center gap-3 px-3 sm:items-end sm:px-6" role="region" aria-label="Nieuwe advertenties" aria-live="assertive">
      {items.map((i) => (
        <article key={i.id} className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[22px] border border-card-border bg-card shadow-pop fade-up" data-testid="popup">
          <div className="flex gap-3 p-4">
            {i.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hiRes(i.image, "thumb")} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-2xl object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="h-16 w-16 shrink-0 rounded-2xl bg-muted-bg" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-accent-strong">{i.provisional ? "Nieuwe advertentie · voorlopig" : "Nieuwe advertentie"}</p>
                <button type="button" aria-label="Sluiten" onClick={() => dismiss(i.id)} className="-mr-1 -mt-1 rounded-full p-1.5 text-muted hover:bg-muted-bg"><X className="h-4 w-4" /></button>
              </div>
              <p className="truncate text-[16px] font-semibold">{i.model}{i.storageGb ? ` ${i.storageGb}GB` : ""}</p>
              <p className="tabular mt-0.5 text-sm text-muted">
                Vraag {formatEuro(i.askingCents)} · markt {formatEuro(i.expectedCents)} · <span className={i.netProfitCents >= 0 ? "font-semibold text-success" : "font-semibold text-danger"}>winst {formatEuro(i.netProfitCents)}</span>
              </p>
              <p className="text-xs text-faint">Score {i.score}{i.distanceKm != null ? ` · ${Math.round(i.distanceKm)} km` : ""}{i.provisional && i.reasons.length ? ` · controleer: ${i.reasons[0]}` : ""}</p>
            </div>
          </div>
          <div className="flex gap-2 border-t border-card-border bg-muted-bg/40 p-3">
            <Link href={`/ads/${i.adId}`} onClick={() => dismiss(i.id)} className="flex h-10 flex-1 items-center justify-center rounded-[14px] bg-gradient-to-r from-[#F9858B] to-[#EF6570] text-sm font-semibold text-white">Bekijk deal</Link>
            {i.externalUrl && (
              <a href={i.externalUrl} target="_blank" rel="noopener noreferrer" className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-card text-sm font-semibold">Marktplaats <ArrowUpRight className="h-4 w-4" /></a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
