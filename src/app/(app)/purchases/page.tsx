import type { Metadata } from "next";
import { PurchasesBoard, type PurchaseRow } from "@/components/purchases/purchases-board";
import { BestProducts, ProfitTimeline } from "@/components/purchases/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatEuro } from "@/lib/format";
import { purchaseStats } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mijn inkopen" };

export default async function PurchasesPage() {
  const user = await getCurrentUser();
  const s = await purchaseStats(user!.id);
  const rows: PurchaseRow[] = s.purchases.map((p) => ({
    id: p.id, adId: p.adId, title: p.title, status: p.status, askingCents: p.askingCents, buyPriceCents: p.buyPriceCents, boughtAt: p.boughtAt?.toISOString() ?? null,
    repairCostCents: p.repairCostCents, extraCostCents: p.extraCostCents, notes: p.notes, conditionNote: p.conditionNote,
    sale: p.sale ? { salePriceCents: p.sale.salePriceCents, soldAt: p.sale.soldAt.toISOString(), extraCostCents: p.sale.extraCostCents, platform: p.sale.platform } : null,
    profitCents: s.perPurchaseProfit.get(p.id) ?? null,
  }));
  const kpis: Array<[string, string, string?]> = [
    ["Totale inkoopwaarde", formatEuro(s.totalBuy)],
    ["Voorraadwaarde", formatEuro(s.stockValue), "nog niet verkocht"],
    ["Gerealiseerde winst", formatEuro(s.realized), `${s.soldCount} verkocht`],
    ["Gem. winst per product", s.soldCount ? formatEuro(Math.round(s.avgProfit)) : "—"],
    ["Gem. verkooptijd", s.avgDays != null ? `${Math.round(s.avgDays)} dagen` : "—"],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Mijn inkopen</h1>
        <p className="mt-1 text-muted">Van interessante advertentie tot verkocht product. Verkopen verbeteren automatisch je marktwaarderingen.</p>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Kerncijfers">
        {kpis.map(([l, v, sub]) => (
          <Card key={l} className="p-5"><p className="text-[13px] font-medium text-muted">{l}</p><p className="tabular mt-2 text-2xl font-semibold tracking-tight">{v}</p>{sub && <p className="mt-1 text-xs text-muted">{sub}</p>}</Card>
        ))}
      </section>
      <PurchasesBoard rows={rows} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Winstontwikkeling</CardTitle></CardHeader><CardContent><ProfitTimeline data={s.timeline} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Meest winstgevende producten</CardTitle></CardHeader><CardContent><BestProducts data={s.best} /></CardContent></Card>
      </div>
    </div>
  );
}
