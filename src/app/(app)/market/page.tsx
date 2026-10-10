import type { Metadata } from "next";
import { AddComparable, DeleteComparable } from "@/components/market/market-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db/client";
import { median } from "@/lib/engines/valuation";
import { formatEuro } from "@/lib/format";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marktdata" };

export default async function MarketPage() {
  const cfg = await getConfig();
  const comps = await prisma.marketComparable.findMany({ where: { isDemo: cfg.demoMode }, orderBy: { observedAt: "desc" }, take: 1500 });
  const byModel = new Map<string, { asking: number[]; realized: number[] }>();
  for (const c of comps) {
    const e = byModel.get(c.modelKey) ?? { asking: [], realized: [] };
    (c.kind === "REALIZED" ? e.realized : e.asking).push(c.priceCents);
    byModel.set(c.modelKey, e);
  }
  const summary = [...byModel.entries()].map(([k, v]) => ({ key: k, nA: v.asking.length, nR: v.realized.length, mA: median(v.asking), mR: median(v.realized) })).sort((a, b) => b.nA + b.nR - (a.nA + a.nR));
  const manual = comps.filter((c) => c.source === "handmatig" || c.source === "eigen-verkoop").slice(0, 30);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Marktdata</h1>
        <p className="mt-1 max-w-2xl text-muted">De waarderingsmotor gebruikt vergelijkbare vraagprijzen uit je advertenties én gerealiseerde verkoopprijzen. Een vraagprijs is geen verkoopprijs — eigen verkopen wegen daarom zwaarder.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader><div><CardTitle>Per model</CardTitle><CardDescription>{comps.length} prijspunten{cfg.demoMode ? " (demodata)" : ""}</CardDescription></div></CardHeader>
          <CardContent>
            {summary.length === 0 ? (
              <EmptyState title="Nog geen marktdata" description="Importeer advertenties of voeg zelf gerealiseerde verkoopprijzen toe om betrouwbare waarderingen te krijgen." />
            ) : (
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[520px] text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="pb-2 font-medium">Model</th><th className="pb-2 text-right font-medium">Vraagprijzen</th><th className="pb-2 text-right font-medium">Mediaan vraag</th><th className="pb-2 text-right font-medium">Gerealiseerd</th><th className="pb-2 text-right font-medium">Mediaan verkocht</th></tr></thead>
                  <tbody className="divide-y divide-card-border">
                    {summary.map((s) => (
                      <tr key={s.key}>
                        <td className="py-2.5 font-medium">{s.key}</td>
                        <td className="py-2.5 text-right text-muted">{s.nA}</td>
                        <td className="py-2.5 text-right">{s.nA ? formatEuro(s.mA) : "—"}</td>
                        <td className="py-2.5 text-right">{s.nR ? <Badge tone="success">{s.nR}</Badge> : <span className="text-muted">0</span>}</td>
                        <td className="py-2.5 text-right">{s.nR ? formatEuro(s.mR) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Prijs toevoegen</CardTitle><CardDescription>Bijvoorbeeld gerealiseerde verkopen uit je eigen administratie.</CardDescription></div></CardHeader>
          <CardContent><AddComparable /></CardContent>
        </Card>
      </div>
      {manual.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Handmatig ingevoerde en eigen verkopen</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-card-border">
              {manual.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="font-medium">{c.modelKey}</span> <span className="text-muted">{c.storageGb ? `${c.storageGb} GB · ` : ""}{c.observedAt.toLocaleDateString("nl-NL")}</span></span>
                  <span className="flex items-center gap-2"><Badge tone={c.kind === "REALIZED" ? "success" : "neutral"}>{c.kind === "REALIZED" ? "Gerealiseerd" : "Vraagprijs"}</Badge><span className="tabular font-semibold">{formatEuro(c.priceCents)}</span>{c.source === "handmatig" && <DeleteComparable id={c.id} />}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
