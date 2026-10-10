"use client";
import { RefreshCw, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client-api";
import type { MarktplaatsCategory } from "@/lib/catalog/categories";
import { formatDate } from "@/lib/format";

interface Data {
  fetchedAt: string | null;
  source: "marktplaats" | "ingebouwd";
  categories: MarktplaatsCategory[];
}

/** Lijst met Apple-gerelateerde Marktplaats-categorieën, vernieuwbaar vanaf Marktplaats. */
export function CategoriesCard({ data, isAdmin }: { data: Data; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const section = (g: "device" | "accessory", title: string) => {
    const list = data.categories.filter((c) => c.group === g);
    if (!list.length) return null;
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
        <ul className="divide-y divide-card-border rounded-2xl border border-card-border">
          {list.map((c) => (
            <li key={c.path} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
              <span className="min-w-0"><span className="font-medium">{c.label}</span><span className="block truncate text-xs text-muted">{c.path}</span></span>
              {c.count != null && <span className="tabular shrink-0 text-xs text-muted">{c.count.toLocaleString("nl-NL")} advertenties</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Store className="h-4 w-4 text-accent" />Apple op Marktplaats</CardTitle>
          <CardDescription>
            Alle Marktplaats-categorieën waarin Apple-producten staan. {data.source === "marktplaats" ? `Opgehaald van Marktplaats op ${formatDate(data.fetchedAt)}.` : "Ingebouwde lijst (live opgehaald op 10 okt 2026)."} Kies ze bij een zoekprofiel.
          </CardDescription>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ ok: boolean; error?: string; categories?: unknown[] }>("/api/catalog/refresh", { method: "POST", body: {} });
                if (r.ok) toast(`${r.categories?.length ?? 0} categorieën opgehaald van Marktplaats`);
                else toast(r.error ?? "Ophalen mislukt", "err");
                router.refresh();
              } catch (e) {
                toast((e as Error).message, "err");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />Vernieuw vanaf Marktplaats
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {busy && <p className="text-sm text-muted" role="status">Bezig met ophalen… dit duurt ±45 seconden (rustig tempo, 3 s tussen requests).</p>}
        {section("device", "Apparaten")}
        {section("accessory", "Accessoires en onderdelen")}
        <Badge tone="neutral">{data.categories.length} categorieën</Badge>
      </CardContent>
    </Card>
  );
}
