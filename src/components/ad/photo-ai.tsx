"use client";
import * as React from "react";
import { Gallery } from "@/components/ad/gallery";
import { Button } from "@/components/ui/button";
import { LABEL_INFO, type PhotoLabel } from "@/lib/ai/photo-labels";

interface Analysis {
  at: string;
  result: {
    images: Array<{ index: number; labels: PhotoLabel[]; note?: string }>;
    overall: { scratch: "free" | "light" | "heavy" | "unknown"; screenCracked: boolean; batteryHealthPct: number | null; stockPhoto: boolean; confidence: number; summary: string };
  };
}

const SCRATCH = { free: "Geen krassen zichtbaar", light: "Lichte krassen", heavy: "Duidelijke krassen", unknown: "Niet vast te stellen" } as const;

export function PhotoAi({ adId, images, demo, initial }: { adId: string; images: string[]; demo: boolean; initial: Analysis | null }) {
  const [a, setA] = React.useState<Analysis | null>(initial);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function run(force: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ads/${adId}/photos${force ? "?force=1" : ""}`, { method: "POST" });
      const j = (await res.json()) as { analysis?: Analysis; error?: string };
      if (!res.ok || !j.analysis) throw new Error(j.error ?? "Analyse mislukt");
      setA(j.analysis);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analyse mislukt");
    } finally {
      setBusy(false);
    }
  }

  const labels: Record<number, PhotoLabel[]> = {};
  for (const im of a?.result.images ?? []) labels[im.index] = im.labels;
  const o = a?.result.overall;

  return (
    <div className="space-y-3">
      <Gallery images={images} demo={demo} labels={labels} />
      {!demo && images.length > 0 && (
        <div className="rounded-2xl border border-card-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Foto-analyse (AI)</p>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run(!!a)}>{busy ? "Bezig…" : a ? "Opnieuw analyseren" : "Analyseer foto's"}</Button>
          </div>
          {err && <p role="alert" className="mt-2 text-danger">{err}</p>}
          {o && (
            <ul className="mt-2 space-y-1 text-muted">
              <li>{o.screenCracked ? "💥 Gebarsten scherm" : o.scratch === "free" ? "✨" : o.scratch === "unknown" ? "❔" : "⚠️"} {o.screenCracked ? "" : SCRATCH[o.scratch]} <span className="text-xs">(zekerheid {Math.round(o.confidence * 100)}%)</span></li>
              {o.batteryHealthPct != null && <li>🔋 Batterijconditie op de foto: {o.batteryHealthPct}%</li>}
              {o.stockPhoto && <li>🚩 De foto&apos;s lijken stockfoto&apos;s. Wees voorzichtig.</li>}
              {o.summary && <li>{o.summary}</li>}
              <li className="text-xs">Geeft de tekst niets over krassen, dan gebruiken de inkoopregels dit oordeel (bij ≥70% zekerheid). AI kan zich vergissen; controleer de foto&apos;s zelf.</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
