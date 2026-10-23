"use client";
import { Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { APPLE_MODELS } from "@/lib/catalog/apple";
import { api } from "@/lib/client-api";
import type { RulesConfig } from "@/lib/rules/config";
import { ADTYPE_LABEL, CONDITION_LABEL, type FilterAdType, type FilterCondition, type SearchFilter } from "@/lib/rules/filters";

const PAGE = 100;
/** Groepskop zoals in de lijst van de klant: "Apple iPhone", "Apple iPad Air", "MacBook Air", … */
function categoryOf(modelKey: string): string {
  const m = APPLE_MODELS.find((x) => x.key === modelKey);
  if (!m) return "Overig";
  if (m.family === "iphone") return "Apple iPhone";
  if (m.family === "ipad") return `Apple ${m.group}`;
  if (m.family === "watch") return "Apple Watch";
  if (m.family === "macbook_air") return "MacBook Air";
  if (m.family === "macbook") return m.group;
  if (m.family === "mac_mini") return "Apple Mac Mini";
  if (m.family === "imac") return "Apple iMac";
  return m.group;
}
const labelOf = (key: string, variant: string) => `${APPLE_MODELS.find((m) => m.key === key)?.label ?? key}${variant ? ` ${variant}″` : ""}`;

export function FiltersEditor({ initialFilters, initialRules, isAdmin }: { initialFilters: SearchFilter[]; initialRules: RulesConfig; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [filters, setFilters] = React.useState<SearchFilter[]>(initialFilters);
  const [rules, setRules] = React.useState<RulesConfig>(initialRules);
  const [paste, setPaste] = React.useState("");
  const [q, setQ] = React.useState("");
  const [cond, setCond] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<{ added: number; errors: string[]; unmatched: string[] } | null>(null);
  const wrap = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(null); } };

  const shown = React.useMemo(() => filters.map((f, i) => ({ f, i })).filter(({ f }) => (!q || labelOf(f.modelKey, f.variant).toLowerCase().includes(q.toLowerCase())) && (!cond || f.condition === cond)), [filters, q, cond]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const view = shown.slice(page * PAGE, page * PAGE + PAGE);
  const set = (i: number, patch: Partial<SearchFilter>) => setFilters((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const doImport = (replace: boolean) => wrap("import", async () => {
    const r = await api<{ rows: SearchFilter[]; errors: string[]; unmatched: string[] }>("/api/rules/filters", { body: { text: paste } });
    setReport({ added: r.rows.length, errors: r.errors, unmatched: r.unmatched });
    if (!r.rows.length) return;
    setFilters((l) => (replace ? r.rows : [...l, ...r.rows]));
    setPaste("");
    toast(`${r.rows.length} zoekfilters ingelezen. Klik op Opslaan om ze te bewaren`);
  });
  const save = () => wrap("save", async () => {
    const r = await api<{ filters: SearchFilter[] }>("/api/rules/filters", { method: "PUT", body: { filters } });
    setFilters(r.filters);
    await api("/api/rules", { method: "PUT", body: rules });
    toast(`${r.filters.length} zoekfilters opgeslagen`);
    router.refresh();
  });

  const cell = "px-2 py-1.5";
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><div><CardTitle>Zoekfilters gebruiken</CardTitle><CardDescription>Staat dit aan, dan moet elke advertentie bij een zoekfilter passen. Met prijsbasis &quot;Max inkoop bij 85% batterij&quot; is de zoekfilterprijs ook de basis voor de berekening.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <Switch checked={rules.filters.enabled} onChange={(v) => setRules((r) => ({ ...r, filters: { ...r.filters, enabled: v } }))} label="Zoekfilters aan" disabled={!isAdmin} />
            <label className="flex items-center gap-2 text-sm">Model buiten de lijst:
              <Select value={rules.filters.outsideList} disabled={!isAdmin} onChange={(e) => setRules((r) => ({ ...r, filters: { ...r.filters, outsideList: e.target.value as "reject" | "ignore" } }))}>
                <option value="reject">Afwijzen</option><option value="ignore">Gewone regels laten beslissen</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">Prijsbasis:
              <Select value={rules.priceBase} disabled={!isAdmin} onChange={(e) => setRules((r) => ({ ...r, priceBase: e.target.value as "sell" | "buy85" }))}>
                <option value="sell">Verkoopprijs in perfecte staat</option><option value="buy85">Max inkoop bij 85% batterij (zoekfilterprijs)</option>
              </Select>
            </label>
          </div>
          {rules.filters.enabled && filters.length === 0 && <Notice tone="warning">Zoekfilters staan aan maar de lijst is leeg: alles wordt afgewezen. Importeer eerst de lijst.</Notice>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Lijst ({filters.length} zoekfilters)</CardTitle><CardDescription>Model, opslag, conditie, prijsgrenzen, maximale afstand, type advertentie en minimale tijd dat de verkoper actief is.</CardDescription></div>
          {isAdmin && <Button onClick={save} loading={busy === "save"}><Save className="h-4 w-4" />Opslaan</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Input aria-label="Zoek in de lijst" placeholder="Zoek model…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="max-w-xs" />
            <Select aria-label="Filter op conditie" value={cond} onChange={(e) => { setCond(e.target.value); setPage(0); }}>
              <option value="">Alle condities</option>{(Object.keys(CONDITION_LABEL) as FilterCondition[]).map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
            </Select>
          </div>
          <div className="overflow-auto rounded-2xl border border-card-border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted-bg text-left text-xs text-muted"><tr>
                <th className="px-3 py-2">Model</th><th className="px-2 py-2">Opslag</th><th className="px-2 py-2">Conditie</th><th className="px-2 py-2">Min €</th><th className="px-2 py-2">Max €</th>
                <th className="px-2 py-2">Max afstand (km)</th><th className="px-2 py-2">Type advertentie</th><th className="px-2 py-2">Type verkoper</th><th className="px-2 py-2">Verkoper actief (mnd)</th><th />
              </tr></thead>
              <tbody>
                {view.map(({ f, i }, n) => (
                  <React.Fragment key={f.id + i}>
                  {(n === 0 || categoryOf(view[n - 1].f.modelKey) !== categoryOf(f.modelKey)) && (
                    <tr className="bg-muted-bg/60"><td colSpan={10} className="px-3 py-2 text-sm font-semibold text-foreground/80">{categoryOf(f.modelKey)}</td></tr>
                  )}
                  <tr className="border-t border-card-border">
                    <td className="min-w-[13rem] px-3 py-1.5 font-medium">{labelOf(f.modelKey, f.variant)}</td>
                    <td className={cell}><Input aria-label="Opslag (GB, leeg = alle)" type="number" className="w-24" value={f.storageGb ?? ""} placeholder="Alle" disabled={!isAdmin} onChange={(e) => set(i, { storageGb: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                    <td className={cell}><Select aria-label="Conditie" className="min-w-[8.5rem]" value={f.condition} disabled={!isAdmin} onChange={(e) => set(i, { condition: e.target.value as FilterCondition })}>{(Object.keys(CONDITION_LABEL) as FilterCondition[]).map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}</Select></td>
                    <td className={cell}><Input aria-label="Minimale prijs" type="number" className="w-20" value={f.minEuro} disabled={!isAdmin} onChange={(e) => set(i, { minEuro: Number(e.target.value) })} /></td>
                    <td className={cell}><Input aria-label="Maximale prijs" type="number" className="w-24" value={f.maxEuro} disabled={!isAdmin} onChange={(e) => set(i, { maxEuro: Number(e.target.value) })} /></td>
                    <td className={cell}><Input aria-label="Maximale afstand" type="number" className="w-24" value={f.maxKm} disabled={!isAdmin} onChange={(e) => set(i, { maxKm: Number(e.target.value) })} /></td>
                    <td className={cell}><Select aria-label="Type advertentie" className="min-w-[10.5rem]" value={f.adType} disabled={!isAdmin} onChange={(e) => set(i, { adType: e.target.value as FilterAdType })}>{(Object.keys(ADTYPE_LABEL) as FilterAdType[]).map((c) => <option key={c} value={c}>{ADTYPE_LABEL[c]}</option>)}</Select></td>
                    <td className={cell}>{f.sellerType}</td>
                    <td className={cell}><Input aria-label="Verkoper actief (maanden)" type="number" className="w-20" value={f.sellerMinMonths} disabled={!isAdmin} onChange={(e) => set(i, { sellerMinMonths: Number(e.target.value) })} /></td>
                    <td className="px-2">{isAdmin && <button type="button" aria-label="Zoekfilter verwijderen" className="rounded-lg p-2 text-muted hover:bg-muted-bg hover:text-danger" onClick={() => setFilters((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                  </React.Fragment>
                ))}
                {view.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">Geen zoekfilters{filters.length ? " voor deze selectie" : ". Importeer de lijst hieronder."}</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{shown.length} regels · pagina {page + 1} van {pages}</span>
              <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Vorige</Button><Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Volgende</Button></span>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><div><CardTitle>Lijst importeren</CardTitle><CardDescription>Plak de tabel uit het spreadsheet (kolommen: Model, Opslag, Conditie, Minimale prijs, Maximale prijs, Maximale afstand, Type advertentie, Type verkoper, Verkoper actief). Overige kolommen worden genegeerd.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            <Textarea aria-label="Geplakte zoekfilters" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"iPhone 13\t128GB\tNormaal\t50\t320\t300\tVraagprijs\tAlle\t0 maanden"} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!paste.trim()} loading={busy === "import"} onClick={() => doImport(false)}><Upload className="h-4 w-4" />Toevoegen</Button>
              <Button variant="outline" disabled={!paste.trim()} loading={busy === "import"} onClick={() => doImport(true)}>Lijst vervangen</Button>
            </div>
            {report && (
              <Notice tone={report.unmatched.length || report.errors.length ? "warning" : "success"}>
                {report.added} regels ingelezen.{report.unmatched.length ? ` Niet herkende modellen: ${report.unmatched.join(", ")}.` : ""}{report.errors.length ? ` Problemen: ${report.errors.slice(0, 5).join(" · ")}` : ""}
              </Notice>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
