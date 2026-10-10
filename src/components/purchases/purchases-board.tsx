"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { eurosToCents, formatEuro, formatDate } from "@/lib/format";

export interface PurchaseRow {
  id: string;
  adId: string | null;
  title: string;
  status: string;
  askingCents: number | null;
  buyPriceCents: number | null;
  boughtAt: string | null;
  repairCostCents: number;
  extraCostCents: number;
  notes: string;
  conditionNote: string | null;
  sale: { salePriceCents: number; soldAt: string; extraCostCents: number; platform: string | null } | null;
  profitCents: number | null;
}

const STATUS: Array<[string, string, "neutral" | "accent" | "warning" | "success" | "danger"]> = [
  ["INTERESTING", "Interessant", "neutral"], ["CONTACTED", "Contact opgenomen", "accent"], ["NEGOTIATING", "Onderhandeling", "accent"], ["BOUGHT", "Gekocht", "warning"], ["LISTED", "Te koop aangeboden", "warning"], ["SOLD", "Verkocht", "success"], ["REJECTED", "Afgewezen", "danger"],
];
const toDate = (s: string | null) => (s ? s.slice(0, 10) : "");
const today = () => new Date().toISOString().slice(0, 10);

export function PurchasesBoard({ rows }: { rows: PurchaseRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = React.useState("");
  const [edit, setEdit] = React.useState<PurchaseRow | "new" | null>(null);
  const [sale, setSale] = React.useState<PurchaseRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const shown = rows.filter((r) => !filter || r.status === filter);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setEdit(null);
      setSale(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  const [f, setF] = React.useState({ title: "", status: "BOUGHT", ask: "", buy: "", boughtAt: today(), repair: "", extra: "", notes: "", cond: "" });
  React.useEffect(() => {
    if (edit === "new") setF({ title: "", status: "BOUGHT", ask: "", buy: "", boughtAt: today(), repair: "", extra: "", notes: "", cond: "" });
    else if (edit) setF({ title: edit.title, status: edit.status, ask: edit.askingCents != null ? String(edit.askingCents / 100) : "", buy: edit.buyPriceCents != null ? String(edit.buyPriceCents / 100) : "", boughtAt: toDate(edit.boughtAt), repair: String(edit.repairCostCents / 100), extra: String(edit.extraCostCents / 100), notes: edit.notes, cond: edit.conditionNote ?? "" });
  }, [edit]);
  const [s, setS] = React.useState({ price: "", date: today(), extra: "", platform: "" });
  React.useEffect(() => { if (sale) setS({ price: sale.sale ? String(sale.sale.salePriceCents / 100) : "", date: sale.sale ? toDate(sale.sale.soldAt) : today(), extra: sale.sale ? String(sale.sale.extraCostCents / 100) : "", platform: sale.sale?.platform ?? "" }); }, [sale]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter op status">
          <button type="button" aria-pressed={filter === ""} onClick={() => setFilter("")} className={`rounded-full px-3.5 py-1.5 text-sm transition ${filter === "" ? "bg-foreground text-background" : "bg-muted-bg text-muted hover:text-foreground"}`}>Alle ({rows.length})</button>
          {STATUS.map(([k, l]) => {
            const n = rows.filter((r) => r.status === k).length;
            return n ? <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-3.5 py-1.5 text-sm transition ${filter === k ? "bg-foreground text-background" : "bg-muted-bg text-muted hover:text-foreground"}`}>{l} ({n})</button> : null;
          })}
        </div>
        <Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Inkoop toevoegen</Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nog geen inkopen" description="Markeer een advertentie als ‘gekocht’ op de detailpagina, of voeg hier handmatig een inkoop toe." action={<Button onClick={() => setEdit("new")}>Inkoop toevoegen</Button>} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="tabular w-full min-w-[820px] text-left text-sm">
            <thead><tr className="border-b border-card-border text-xs uppercase tracking-wide text-muted">{["Product", "Status", "Inkoop", "Kosten", "Verkocht voor", "Winst", ""].map((h) => (<th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>))}</tr></thead>
            <tbody>
              {shown.map((r) => {
                const st = STATUS.find((x) => x[0] === r.status)!;
                return (
                  <tr key={r.id} className="border-b border-card-border last:border-0">
                    <td className="max-w-[260px] px-4 py-3">{r.adId ? <Link href={`/ads/${r.adId}`} className="line-clamp-1 font-medium hover:text-accent">{r.title}</Link> : <span className="line-clamp-1 font-medium">{r.title}</span>}<span className="text-xs text-muted">{r.boughtAt ? `gekocht ${formatDate(r.boughtAt)}` : ""}</span></td>
                    <td className="px-4 py-3"><Select aria-label={`Status van ${r.title}`} className="h-9 w-44 text-[13px]" value={r.status} onChange={(e) => run(() => api(`/api/purchases/${r.id}`, { method: "PATCH", body: { status: e.target.value } }), "Status bijgewerkt")}>{STATUS.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}</Select><Badge tone={st[2]} className="sr-only">{st[1]}</Badge></td>
                    <td className="px-4 py-3">{formatEuro(r.buyPriceCents)}</td>
                    <td className="px-4 py-3 text-muted">{formatEuro(r.repairCostCents + r.extraCostCents + (r.sale?.extraCostCents ?? 0))}</td>
                    <td className="px-4 py-3">{r.sale ? formatEuro(r.sale.salePriceCents) : "—"}</td>
                    <td className={`px-4 py-3 font-semibold ${r.profitCents == null ? "text-muted" : r.profitCents >= 0 ? "text-success" : "text-danger"}`}>{r.profitCents == null ? "—" : formatEuro(r.profitCents)}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      {["BOUGHT", "LISTED", "SOLD"].includes(r.status) && <Button size="sm" variant="soft" onClick={() => setSale(r)}>{r.sale ? "Verkoop wijzigen" : "Verkocht"}</Button>}
                      <Button size="icon" variant="ghost" aria-label="Bewerken" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" aria-label="Verwijderen" onClick={() => confirm("Deze inkoop verwijderen?") && run(() => api(`/api/purchases/${r.id}`, { method: "DELETE" }), "Verwijderd")}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "Inkoop toevoegen" : "Inkoop bewerken"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = { title: f.title, status: f.status, askingCents: f.ask ? eurosToCents(f.ask) : null, buyPriceCents: f.buy ? eurosToCents(f.buy) : null, boughtAt: f.boughtAt ? new Date(f.boughtAt).toISOString() : null, repairCostCents: f.repair ? eurosToCents(f.repair) : 0, extraCostCents: f.extra ? eurosToCents(f.extra) : 0, notes: f.notes, conditionNote: f.cond || null };
            void run(() => (edit === "new" ? api("/api/purchases", { body }) : api(`/api/purchases/${(edit as PurchaseRow).id}`, { method: "PATCH", body })), "Inkoop opgeslagen");
          }}
        >
          <Field label="Product" htmlFor="pu-t"><Input id="pu-t" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="pu-s"><Select id="pu-s" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}</Select></Field>
            <Field label="Aankoopdatum" htmlFor="pu-d"><Input id="pu-d" type="date" value={f.boughtAt} onChange={(e) => setF({ ...f, boughtAt: e.target.value })} /></Field>
            <Field label="Vraagprijs (€)" htmlFor="pu-a"><Input id="pu-a" type="number" min="0" value={f.ask} onChange={(e) => setF({ ...f, ask: e.target.value })} /></Field>
            <Field label="Werkelijke inkoop (€)" htmlFor="pu-b"><Input id="pu-b" type="number" min="0" value={f.buy} onChange={(e) => setF({ ...f, buy: e.target.value })} /></Field>
            <Field label="Reparatiekosten (€)" htmlFor="pu-r"><Input id="pu-r" type="number" min="0" value={f.repair} onChange={(e) => setF({ ...f, repair: e.target.value })} /></Field>
            <Field label="Bijkomende kosten (€)" htmlFor="pu-e"><Input id="pu-e" type="number" min="0" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} /></Field>
          </div>
          <Field label="Productconditie" htmlFor="pu-c"><Input id="pu-c" value={f.cond} maxLength={500} onChange={(e) => setF({ ...f, cond: e.target.value })} /></Field>
          <Field label="Notities" htmlFor="pu-n"><Textarea id="pu-n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <Button type="submit" className="w-full" loading={busy}>Opslaan</Button>
        </form>
      </Dialog>

      <Dialog open={!!sale} onClose={() => setSale(null)} title="Verkoop registreren">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api(`/api/purchases/${sale!.id}/sale`, { body: { salePriceCents: eurosToCents(s.price), soldAt: new Date(s.date).toISOString(), extraCostCents: s.extra ? eurosToCents(s.extra) : 0, platform: s.platform || null } }), "Verkoop geregistreerd — wordt gebruikt voor toekomstige waarderingen");
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Verkoopprijs (€)" htmlFor="sa-p"><Input id="sa-p" type="number" min="0" required value={s.price} onChange={(e) => setS({ ...s, price: e.target.value })} /></Field>
            <Field label="Verkoopdatum" htmlFor="sa-d"><Input id="sa-d" type="date" required value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} /></Field>
            <Field label="Bijkomende kosten (€)" htmlFor="sa-e"><Input id="sa-e" type="number" min="0" value={s.extra} onChange={(e) => setS({ ...s, extra: e.target.value })} /></Field>
            <Field label="Verkocht via" htmlFor="sa-pl"><Input id="sa-pl" value={s.platform} onChange={(e) => setS({ ...s, platform: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-muted">Deze gerealiseerde verkoopprijs weegt zwaarder mee dan vraagprijzen in de marktwaardering.</p>
          <Button type="submit" className="w-full" loading={busy}>Opslaan</Button>
        </form>
      </Dialog>
    </div>
  );
}
