"use client";
import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { Chips } from "@/components/filters/chips";
import { ProductPicker } from "@/components/filters/product-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { FIELD_DEFS } from "@/lib/engines/filters";
import { FilterTestPanel } from "@/components/filters/filter-test-panel";
import { buildTree, type AdvancedGroup, type QuickFilters } from "@/lib/profile-quick";

export interface FilterState {
  quick: QuickFilters;
  groups: AdvancedGroup[];
}

const OP_LABEL: Record<string, string> = {
  eq: "is gelijk aan", neq: "is niet gelijk aan", in: "is één van", nin: "is geen van", gte: "≥", lte: "≤", gt: ">", lt: "<", between: "tussen (min, max)", gte_if_known: "≥ (indien bekend)", lte_if_known: "≤ (indien bekend)",
  containsAny: "bevat één van", containsAll: "bevat alle", containsNone: "bevat geen van", isTrue: "is waar", isFalse: "is onwaar", isKnown: "is bekend",
};

/** Filter-editor (snelle filters + productkiezer + EN/OF-groepen); gedeeld door zoekprofielen en 'Mijn filters'. */
export function FilterBuilder({ state, onChange }: { state: FilterState; onChange: (s: FilterState) => void }) {
  const q = state.quick;
  const groups = state.groups;
  const setQuick = <K extends keyof QuickFilters>(k: K, val: QuickFilters[K]) => onChange({ ...state, quick: { ...q, [k]: val } });
  const setGroups = (g: AdvancedGroup[]) => onChange({ ...state, groups: g });

  const num = (k: keyof QuickFilters, label: string, hint?: string, unit?: string) => (
    <Field label={label} hint={hint} htmlFor={`q-${k}`}>
      <div className="relative">
        <Input id={`q-${k}`} type="number" inputMode="decimal" min="0" value={q[k] as string} onChange={(e) => setQuick(k, e.target.value as never)} className={unit ? "pr-12" : ""} />
        {unit && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{unit}</span>}
      </div>
    </Field>
  );
  const check = (k: keyof QuickFilters, label: string) => <Switch checked={q[k] as boolean} onChange={(x) => setQuick(k, x as never)} label={label} />;

  return (
    <>
      <Card>
        <CardHeader><div><CardTitle>Filters</CardTitle><CardDescription>Alle ingevulde filters moeten tegelijk kloppen (EN). Gebruik hieronder groepen voor OF-logica.</CardDescription></div></CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-foreground/80">Productmodellen</p>
            <ProductPicker value={q.models} onChange={(m) => setQuick("models", m)} />
            <p className="mt-1 text-xs text-muted">Kies één of meer modellen uit de volledige Apple-lijst. Leeg = alle modellen.</p>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-foreground/80">Opslag</p>
            <div className="flex flex-wrap gap-2">
              {[64, 128, 256, 512, 1024].map((s) => (
                <button key={s} type="button" aria-pressed={q.storage.includes(s)} onClick={() => setQuick("storage", q.storage.includes(s) ? q.storage.filter((x) => x !== s) : [...q.storage, s])} className={cn("rounded-full border px-4 py-1.5 text-sm transition", q.storage.includes(s) ? "border-accent bg-accent-soft text-accent" : "border-border text-foreground/80 hover:bg-muted-bg")}>
                  {s >= 1024 ? `${s / 1024} TB` : `${s} GB`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {num("maxPrice", "Maximale inkoopprijs", undefined, "€")}
            {num("minProfit", "Minimale verwachte winst", undefined, "€")}
            {num("minRoi", "Minimaal rendement", undefined, "%")}
            {num("maxDistance", "Maximale afstand (ophalen)", "Bijv. 45 km. Zie hieronder voor verder weg.", "km")}
            {num("minBattery", "Batterijconditie minimaal", undefined, "%")}
            {num("maxAgeHours", "Maximale advertentieleeftijd", undefined, "uur")}
            {num("minScore", "Minimale dealscore", undefined, "/100")}
            <Field label="Maximale risico-inschatting" htmlFor="q-risk">
              <Select id="q-risk" value={q.maxRisk} onChange={(e) => setQuick("maxRisk", e.target.value as QuickFilters["maxRisk"])}>
                <option value="">Geen beperking</option>
                <option value="LOW">Alleen laag risico</option>
                <option value="MEDIUM">Tot gemiddeld risico</option>
                <option value="HIGH">Tot hoog risico (zonder blokkades)</option>
              </Select>
            </Field>
            <Field label="Verzending / ophalen" htmlFor="q-ship">
              <Select id="q-ship" value={q.shipping} onChange={(e) => setQuick("shipping", e.target.value as QuickFilters["shipping"])}>
                <option value="">Maakt niet uit</option>
                <option value="shipping">Verzenden mogelijk</option>
                <option value="pickup">Ophalen mogelijk</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inclusiezoekwoorden (minstens één)" htmlFor="q-inc"><Chips id="q-inc" value={q.includeWords} onChange={(w) => setQuick("includeWords", w)} placeholder="bijv. zgan" /></Field>
            <Field label="Uitsluitingszoekwoorden" htmlFor="q-exc"><Chips id="q-exc" value={q.excludeWords} onChange={(w) => setQuick("excludeWords", w)} placeholder="bijv. defect, kapot" /></Field>
          </div>
          <div className="space-y-4 rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold">Afstand, batterij &amp; verkoper</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Onbekende afstand" htmlFor="q-ud">
                <Select id="q-ud" value={q.unknownDistance} onChange={(e) => setQuick("unknownDistance", e.target.value as QuickFilters["unknownDistance"])}>
                  <option value="allow">Doorlaten (apart beoordelen)</option>
                  <option value="exclude">Uitsluiten</option>
                </Select>
              </Field>
              <Field label="Onbekende batterijconditie" htmlFor="q-ub">
                <Select id="q-ub" value={q.unknownBattery} onChange={(e) => setQuick("unknownBattery", e.target.value as QuickFilters["unknownBattery"])}>
                  <option value="allow">Doorlaten (apart beoordelen)</option>
                  <option value="exclude">Uitsluiten</option>
                </Select>
              </Field>
              {num("minSellerTrust", "Minimale betrouwbaarheid verkoper", "Onbekend telt nooit als voldoende. Zie uitleg bij de advertentie.", "/100")}
            </div>
            <div className="space-y-3 border-t border-card-border pt-4">
              <Switch checked={q.farRule.enabled} onChange={(x) => setQuick("farRule", { ...q.farRule, enabled: x })} label="Verder dan de maximale afstand: toch interessant onder voorwaarden (OF-regel)" />
              {q.farRule.enabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {q.maxDistance === "" && <p className="text-xs text-warning sm:col-span-2">Vul eerst een maximale afstand in; de OF-regel geldt voor advertenties verder dan die afstand.</p>}
                  <Field label="Minimale winst na verzendkosten" htmlFor="q-far-profit" hint="De verwachte winst houdt al rekening met ingestelde verzend-/transportkosten.">
                    <Input id="q-far-profit" type="number" min="0" value={q.farRule.minProfit} onChange={(e) => setQuick("farRule", { ...q.farRule, minProfit: e.target.value })} />
                  </Field>
                  <Field label="Minimale betrouwbaarheid verkoper" htmlFor="q-far-trust" hint="Verzending moet mogelijk zijn. Leeg = geen eis aan betrouwbaarheid.">
                    <Input id="q-far-trust" type="number" min="0" max="100" value={q.farRule.minTrust} onChange={(e) => setQuick("farRule", { ...q.farRule, minTrust: e.target.value })} />
                  </Field>
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {check("requireProof", "Alleen met vermeld aankoopbewijs")}
            {check("excludeDefects", "Defecte producten uitsluiten")}
            {check("excludeLocked", "iCloud-/MDM-vergrendeling uitsluiten")}
            {check("requirePhotos", "Alleen advertenties met foto's")}
            {check("requireInfo", "Alleen advertenties met voldoende informatie")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Geavanceerde groepen (EN / OF)</CardTitle><CardDescription>Elke groep telt als één voorwaarde in het geheel. Binnen een groep kies je EN of OF.</CardDescription></div>
          <Button type="button" variant="outline" size="sm" onClick={() => setGroups([...groups, { op: "OR", conditions: [{ field: "modelKey", operator: "eq", value: "" }] }])}><Plus className="h-3.5 w-3.5" />Groep</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.length === 0 && <p className="text-sm text-muted">Geen extra groepen. Voeg er een toe voor bijvoorbeeld &ldquo;model A OF model B&rdquo;.</p>}
          {groups.map((g, gi) => (
            <div key={gi} className="rounded-2xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Voldoe aan</span>
                  <Select aria-label="Logica" className="h-9 w-28" value={g.op} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, op: e.target.value as "AND" | "OR" } : x)))}>
                    <option value="AND">alle (EN)</option>
                    <option value="OR">één van (OF)</option>
                  </Select>
                  <span className="text-muted">onderstaande regels</span>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Verwijder groep" onClick={() => setGroups(groups.filter((_, i) => i !== gi))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2">
                {g.conditions.map((c, ci) => {
                  const def = FIELD_DEFS.find((f) => f.key === c.field) ?? FIELD_DEFS[0];
                  const update = (patch: Partial<typeof c>) => setGroups(groups.map((x, i) => (i === gi ? { ...x, conditions: x.conditions.map((y, j) => (j === ci ? { ...y, ...patch } : y)) } : x)));
                  const noValue = ["isTrue", "isFalse", "isKnown"].includes(c.operator);
                  return (
                    <div key={ci} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr_auto]">
                      <Select aria-label="Veld" className="h-10" value={c.field} onChange={(e) => { const d = FIELD_DEFS.find((f) => f.key === e.target.value)!; update({ field: d.key, operator: d.operators[0], value: "" }); }}>
                        {FIELD_DEFS.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                      </Select>
                      <Select aria-label="Operator" className="h-10 col-start-1 sm:col-start-auto" value={c.operator} onChange={(e) => update({ operator: e.target.value })}>
                        {def.operators.map((o) => (<option key={o} value={o}>{OP_LABEL[o] ?? o}</option>))}
                      </Select>
                      <Input aria-label="Waarde" className="h-10" disabled={noValue} placeholder={def.help ?? (def.type === "number" ? "getal" : "waarde, meerdere met komma")} value={noValue ? "" : c.value} onChange={(e) => update({ value: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Verwijder regel" className="row-start-1 col-start-2 sm:col-start-auto sm:row-start-auto" onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, conditions: x.conditions.filter((_, j) => j !== ci) } : x)))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, conditions: [...x.conditions, { field: "modelKey", operator: "eq", value: "" }] } : x)))}><Plus className="h-3.5 w-3.5" />Regel toevoegen</Button>
            </div>
          ))}
        </CardContent>
      </Card>

          <FilterTestPanel tree={buildTree(state.quick, state.groups, FIELD_DEFS)} />
    </>
  );
}
