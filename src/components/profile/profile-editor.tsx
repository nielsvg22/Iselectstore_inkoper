"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client-api";
import { FIELD_DEFS } from "@/lib/engines/filters";
import { KNOWN_CATEGORIES } from "@/lib/sources/search-categories";
import { buildTree, emptyQuick, treeToQuick, type AdvancedGroup, type QuickFilters } from "@/lib/profile-quick";
import type { ProfileFormValue } from "@/lib/profile-form";

const MODEL_SUGGESTIONS = ["iphone-17", "iphone-16", "iphone-16-pro", "iphone-15", "iphone-15-pro", "iphone-15-pro-max", "iphone-14", "iphone-14-pro", "iphone-13", "iphone-12", "iphone-11", "macbook-air-m1-13", "macbook-air-m2-13", "macbook-air-m3-13", "macbook-pro-m3-pro-14", "ipad-pro-11-m2", "watch-series-9", "airpods-pro-2"];

function Chips({ id, value, onChange, placeholder, listId }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string; listId?: string }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            {v}
            <button type="button" aria-label={`Verwijder ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full px-0.5 hover:bg-accent/20">×</button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        className="mt-2"
        list={listId}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

export function ProfileEditor({ initial }: { initial: ProfileFormValue }) {
  const router = useRouter();
  const toast = useToast();
  const parsed = React.useMemo(() => treeToQuick(initial.tree), [initial.tree]);
  const [v, setV] = React.useState(initial);
  const [q, setQ] = React.useState<QuickFilters>(parsed.quick);
  const [groups, setGroups] = React.useState<AdvancedGroup[]>(parsed.groups);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const setQuick = <K extends keyof QuickFilters>(k: K, val: QuickFilters[K]) => setQ((s) => ({ ...s, [k]: val }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const urls = v.urls.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      const body = {
        name: v.name,
        active: v.active,
        query: v.query,
        sourceKind: v.sourceKind,
        sourceConfig:
          v.sourceKind === "SEARCH"
            ? { queries: v.queries.length ? v.queries : q.models.map((m) => m.replace(/-/g, " ")), category: v.category, maxPages: v.maxPages, fetchDetails: v.fetchDetails }
            : v.sourceKind === "MANUAL_URL"
              ? { urls }
              : v.sourceKind === "FEED"
                ? { feedUrl: v.feedUrl }
                : {},
        intervalMinutes: v.intervalMinutes,
        notifyEnabled: v.notifyEnabled,
        notifyChannels: v.notifyChannels,
        notifyMinScore: v.notifyMinScore,
        prioritizeNew: v.prioritizeNew,
        tree: buildTree(q, groups, FIELD_DEFS),
      };
      if (v.id) await api(`/api/profiles/${v.id}`, { method: "PUT", body });
      else await api("/api/profiles", { body });
      toast("Zoekprofiel opgeslagen");
      router.push("/profiles");
      router.refresh();
    } catch (error) {
      setErr((error as Error).message);
      setBusy(false);
    }
  }

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
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader><div><CardTitle>Basis</CardTitle><CardDescription>Naam, bron en controlefrequentie.</CardDescription></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Naam" htmlFor="p-name"><Input id="p-name" required maxLength={100} placeholder="iPhone 15 Pro inkoop" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Controlefrequentie" htmlFor="p-int" hint="De bron kan een minimale interval afdwingen.">
              <Select id="p-int" value={v.intervalMinutes} onChange={(e) => setV({ ...v, intervalMinutes: Number(e.target.value) })}>
                {[[15, "Elke 15 minuten"], [30, "Elke 30 minuten"], [60, "Elk uur"], [180, "Elke 3 uur"], [360, "Elke 6 uur"], [1440, "Dagelijks"]].map(([m, l]) => (<option key={m} value={m}>{l}</option>))}
              </Select>
            </Field>
            <Field label="Databron" htmlFor="p-src">
              <Select id="p-src" value={v.sourceKind} onChange={(e) => setV({ ...v, sourceKind: e.target.value as ProfileFormValue["sourceKind"] })}>
                <option value="SEARCH">Zoeken op Marktplaats (automatisch alle resultaten)</option>
                <option value="MANUAL_URL">Advertentie-URL&apos;s (periodiek herchecken)</option>
                <option value="FEED">Geautoriseerde feed (JSON/CSV-URL)</option>
                <option value="DEMO">Demonstratiedata</option>
              </Select>
            </Field>
            <Field label="Omschrijving / zoekopdracht" htmlFor="p-q" hint="Alleen ter documentatie voor jezelf."><Input id="p-q" maxLength={200} value={v.query} onChange={(e) => setV({ ...v, query: e.target.value })} /></Field>
          </div>
          {v.sourceKind === "SEARCH" && (
            <div className="space-y-4 rounded-2xl bg-accent-soft p-4">
              <Field label="Zoektermen" htmlFor="p-queries" hint="Bijv. ‘iphone 15 pro’. Elke zoekterm wordt apart doorzocht; Enter om toe te voegen. Leeg laten? Dan worden de gekozen productmodellen bij Filters als zoekterm gebruikt.">
                <Chips id="p-queries" value={v.queries} onChange={(qs) => setV({ ...v, queries: qs })} placeholder="iphone 15 pro" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Categorie" htmlFor="p-cat">
                  <Select id="p-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
                    {KNOWN_CATEGORIES.map((c) => (<option key={c.path} value={c.path}>{c.label}</option>))}
                  </Select>
                </Field>
                <Field label="Pagina’s per zoekterm" htmlFor="p-pages" hint="30 resultaten per pagina, nieuwste eerst.">
                  <Select id="p-pages" value={v.maxPages} onChange={(e) => setV({ ...v, maxPages: Number(e.target.value) })}>
                    {[1, 2, 3, 5, 8, 10].map((n) => (<option key={n} value={n}>{n} ({n * 30} advertenties)</option>))}
                  </Select>
                </Field>
                <div className="flex items-end pb-1"><Switch checked={v.fetchDetails} onChange={(x) => setV({ ...v, fetchDetails: x })} label="Volledige tekst ophalen (nieuwe advertenties)" /></div>
              </div>
              <p className="text-xs text-muted">Prijs-, afstands-, model- en winstfilters hieronder worden door Deal Hunter zelf toegepast op alle gevonden advertenties. Er wordt rustig gezocht (min. 3 s tussen requests) en robots.txt wordt gerespecteerd.</p>
            </div>
          )}
          {v.sourceKind === "MANUAL_URL" && (
            <Field label="Advertentie-URL's (één per regel)" htmlFor="p-urls" hint="Alleen https-URL's van toegestane domeinen (zie Instellingen). Wordt periodiek opnieuw gecontroleerd op prijswijzigingen.">
              <textarea id="p-urls" rows={4} className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft" placeholder="https://www.marktplaats.nl/v/…" value={v.urls} onChange={(e) => setV({ ...v, urls: e.target.value })} />
            </Field>
          )}
          {v.sourceKind === "FEED" && <Field label="Feed-URL" htmlFor="p-feed" hint="JSON of CSV met velden als id, titel, prijs, url, plaats, omschrijving, fotos."><Input id="p-feed" type="url" placeholder="https://…/export.json" value={v.feedUrl} onChange={(e) => setV({ ...v, feedUrl: e.target.value })} /></Field>}
          {v.sourceKind === "DEMO" && <Notice tone="warning">Dit profiel gebruikt voorbeeldgegevens. Er worden geen echte advertenties opgehaald.</Notice>}
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Switch checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Actief" />
            <Switch checked={v.prioritizeNew} onChange={(x) => setV({ ...v, prioritizeNew: x })} label="Nieuwe advertenties voorrang geven" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Filters</CardTitle><CardDescription>Alle ingevulde filters moeten tegelijk kloppen (EN). Gebruik hieronder groepen voor OF-logica.</CardDescription></div></CardHeader>
        <CardContent className="space-y-6">
          <datalist id="models">{MODEL_SUGGESTIONS.map((m) => (<option key={m} value={m} />))}</datalist>
          <Field label="Productmodellen" hint="Model-sleutels, bijv. iphone-15-pro. Meerdere toegestaan; Enter om toe te voegen. Leeg = alle modellen." htmlFor="q-models">
            <Chips id="q-models" value={q.models} onChange={(m) => setQuick("models", m)} placeholder="iphone-15-pro" listId="models" />
          </Field>
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
            {num("maxDistance", "Maximale afstand", "Advertenties zonder afstand komen door.", "km")}
            {num("minBattery", "Batterijconditie minimaal", "Alleen getoetst als bekend.", "%")}
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
          <div className="grid gap-3 sm:grid-cols-2">
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

      <Card>
        <CardHeader><div><CardTitle>Meldingen</CardTitle><CardDescription>Per profiel. Kanalen en tokens stel je in bij Instellingen.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <Switch checked={v.notifyEnabled} onChange={(x) => setV({ ...v, notifyEnabled: x })} label="Meldingen voor dit profiel" />
          {v.notifyEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Melden vanaf dealscore" htmlFor="p-score"><Input id="p-score" type="number" min={0} max={100} value={v.notifyMinScore} onChange={(e) => setV({ ...v, notifyMinScore: Number(e.target.value) })} /></Field>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-foreground/80">Kanalen</p>
                <div className="flex gap-4 pt-2">
                  {(["TELEGRAM", "DISCORD"] as const).map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={v.notifyChannels.includes(c)} onChange={(e) => setV({ ...v, notifyChannels: e.target.checked ? [...v.notifyChannels, c] : v.notifyChannels.filter((x) => x !== c) })} />{c === "TELEGRAM" ? "Telegram" : "Discord"}</label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {err && <Notice tone="danger" className="whitespace-pre-wrap">{err}</Notice>}
      <div className="flex gap-3">
        <Button type="submit" size="lg" loading={busy}>{v.id ? "Wijzigingen opslaan" : "Zoekprofiel aanmaken"}</Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => router.push("/profiles")}>Annuleren</Button>
      </div>
    </form>
  );
}

const OP_LABEL: Record<string, string> = {
  eq: "is gelijk aan", neq: "is niet gelijk aan", in: "is één van", nin: "is geen van", gte: "≥", lte: "≤", between: "tussen (min, max)", gte_if_known: "≥ (indien bekend)", lte_if_known: "≤ (indien bekend)",
  containsAny: "bevat één van", containsAll: "bevat alle", containsNone: "bevat geen van", isTrue: "is waar", isFalse: "is onwaar", isKnown: "is bekend",
};

export { emptyQuick };
