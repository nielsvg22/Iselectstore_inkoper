"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { FIELD_DEFS } from "@/lib/engines/filters";
import { Chips } from "@/components/filters/chips";
import { FilterBuilder } from "@/components/filters/filter-builder";
import { searchPlanFor } from "@/lib/catalog/apple";
import type { MarktplaatsCategory } from "@/lib/catalog/categories";
import type { Group } from "@/lib/engines/filters";
import { buildTree, emptyQuick, treeToQuick, type AdvancedGroup, type QuickFilters } from "@/lib/profile-quick";
import type { ProfileFormValue } from "@/lib/profile-form";

export function ProfileEditor({ initial, savedFilters = [], categories = [] }: { initial: ProfileFormValue; savedFilters?: Array<{ id: string; name: string; tree: Group }>; categories?: MarktplaatsCategory[] }) {
  const router = useRouter();
  const toast = useToast();
  const parsed = React.useMemo(() => treeToQuick(initial.tree), [initial.tree]);
  const [v, setV] = React.useState(initial);
  const [q, setQ] = React.useState<QuickFilters>(parsed.quick);
  const [groups, setGroups] = React.useState<AdvancedGroup[]>(parsed.groups);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [autoQueries, setAutoQueries] = React.useState(initial.queries.length === 0);
  const [filterName, setFilterName] = React.useState("");
  const catOptions = React.useMemo(() => {
    const dev = categories.filter((c) => c.group === "device");
    const list = [{ path: "", label: "Alle categorieën" }, ...dev.map((c) => ({ path: c.path, label: c.label }))];
    if (v.category && !list.some((c) => c.path === v.category)) list.push({ path: v.category, label: v.category });
    return list;
  }, [categories, v.category]);

  // Zoektermen + categorie uit de gekozen modellen (automatisch zolang de gebruiker ze niet zelf heeft ingevuld)
  const applyPlan = (models: string[]) => {
    const plan = searchPlanFor(models);
    setV((cur) => ({ ...cur, queries: plan.queries, category: plan.category }));
  };
  const onFilterChange = (st: { quick: QuickFilters; groups: AdvancedGroup[] }) => {
    const modelsChanged = st.quick.models.join("|") !== q.models.join("|");
    setQ(st.quick);
    setGroups(st.groups);
    if (modelsChanged && autoQueries && v.sourceKind === "SEARCH") applyPlan(st.quick.models);
  };

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
            ? { queries: v.queries.length ? v.queries : q.models.map((m) => m.replace(/-/g, " ")), category: v.category, maxPages: v.maxPages, fetchDetails: v.fetchDetails, fastMode: v.fastMode, mailOnly: v.mailOnly, sliceSearch: v.sliceSearch }
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

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader><div><CardTitle>Basis</CardTitle><CardDescription>Naam, bron en controlefrequentie.</CardDescription></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Naam" htmlFor="p-name"><Input id="p-name" required maxLength={100} placeholder="iPhone 15 Pro inkoop" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Controlefrequentie" htmlFor="p-int" hint="De bron kan een minimale interval afdwingen.">
              <Select id="p-int" value={v.intervalMinutes} onChange={(e) => setV({ ...v, intervalMinutes: Number(e.target.value) })}>
                {[[5, "Elke 5 minuten (snelst)"], [10, "Elke 10 minuten"], [15, "Elke 15 minuten"], [30, "Elke 30 minuten"], [60, "Elk uur"], [180, "Elke 3 uur"], [360, "Elke 6 uur"], [1440, "Dagelijks"]].map(([m, l]) => (<option key={m} value={m}>{l}</option>))}
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
                <Chips id="p-queries" value={v.queries} onChange={(qs) => { setAutoQueries(false); setV({ ...v, queries: qs }); }} placeholder="iphone 15 pro" />
                <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => { applyPlan(q.models); setAutoQueries(true); }} disabled={!q.models.length}>Zoektermen en categorie overnemen uit de gekozen modellen</button>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Categorie" htmlFor="p-cat">
                  <Select id="p-cat" value={v.category} onChange={(e) => { setAutoQueries(false); setV({ ...v, category: e.target.value }); }}>
                    {catOptions.map((c) => (<option key={c.path} value={c.path}>{c.label}</option>))}
                  </Select>
                </Field>
                <Field label="Pagina’s per zoekterm" htmlFor="p-pages" hint="30 resultaten per pagina, nieuwste eerst.">
                  <Select id="p-pages" value={v.maxPages} onChange={(e) => setV({ ...v, maxPages: Number(e.target.value) })}>
                    {[1, 2, 3, 5, 8, 10].map((n) => (<option key={n} value={n}>{n} ({n * 30} advertenties)</option>))}
                  </Select>
                </Field>
                <div className="flex items-end pb-1"><Switch checked={v.fetchDetails} onChange={(x) => setV({ ...v, fetchDetails: x })} label="Volledige tekst ophalen (nieuwe advertenties)" /></div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <Switch checked={v.mailOnly} onChange={(x) => setV({ ...v, mailOnly: x })} label="Alleen via mailbox: niet zelf zoeken, wel filteren en melden voor advertenties uit de gekoppelde Marktplaats-alerts" />
                <p className="mt-2 text-xs text-muted">Koppel de mailbox bij <a href="/settings#mailbox" className="font-medium text-accent-strong underline">Instellingen → Mailbox</a>. Je zoektermen hieronder zijn dan alleen een omschrijving; de filters bepalen of je een push krijgt.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <Switch checked={v.fastMode} onChange={(x) => setV({ ...v, fastMode: x })} label="Snelle modus: elke ±minuut kijken en direct een voorlopige push sturen" />
                {v.fastMode && (
                  <div className="mt-3 border-t border-card-border pt-3">
                    <Switch checked={v.sliceSearch} onChange={(x) => setV({ ...v, sliceSearch: x })} label="Slim zoeken op model en opslag (aanbevolen)" />
                    <p className="mt-2 text-xs text-muted">Kies bij Filters de modellen (en eventueel opslag) die je wilt volgen. We bekijken dan per model en opslag de volledige, smalle resultatenlijst van Marktplaats (bijv. iPhone 15 Pro 256GB: ±220 resultaten in plaats van ±2.200), zodat nieuwe advertenties niet buiten beeld vallen. Om advertenties zonder model-/opslagkenmerk niet te missen, doorlopen we regelmatig ook de gewone zoekterm.</p>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">Gebruik dit voor smalle zoektermen (bijv. ‘iphone 16 pro’). We kijken dan alleen naar de eerste pagina’s en sturen meteen een voorlopige melding; enkele seconden later volgt de definitieve. Werkt alleen als Snelle modus ook is ingeschakeld bij <a href="/settings#snelheid" className="font-medium text-accent-strong underline">Instellingen → Snelheid</a>. Geen realtime-garantie; bij een blokkade door Marktplaats pauzeert de app automatisch.</p>
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
        <CardHeader><div><CardTitle>Eigen filters</CardTitle><CardDescription>Laad een opgeslagen filter, of sla de filters hieronder op om ze later (en op het dashboard) te hergebruiken.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Laad opgeslagen filter" htmlFor="p-load">
            <Select
              id="p-load"
              value=""
              onChange={(e) => {
                const f = savedFilters.find((x) => x.id === e.target.value);
                if (!f) return;
                const t = treeToQuick(f.tree);
                setQ(t.quick);
                setGroups(t.groups);
                if (autoQueries && v.sourceKind === "SEARCH") applyPlan(t.quick.models);
                toast(`Filter “${f.name}” geladen`);
              }}
            >
              <option value="">{savedFilters.length ? "Kies een filter…" : "Nog geen eigen filters (maak ze in Instellingen)"}</option>
              {savedFilters.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </Select>
          </Field>
          <Field label="Huidige filters opslaan als" htmlFor="p-savename">
            <div className="flex gap-2">
              <Input id="p-savename" placeholder="Naam van het filter" maxLength={80} value={filterName} onChange={(e) => setFilterName(e.target.value)} />
              <Button
                type="button"
                variant="secondary"
                disabled={!filterName.trim()}
                onClick={async () => {
                  try {
                    await api("/api/filters", { body: { name: filterName.trim(), tree: buildTree(q, groups, FIELD_DEFS) } });
                    toast("Filter opgeslagen in Mijn filters");
                    setFilterName("");
                    router.refresh();
                  } catch (error) {
                    toast((error as Error).message, "err");
                  }
                }}
              >
                Opslaan
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>

      <FilterBuilder state={{ quick: q, groups }} onChange={onFilterChange} />

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

export { emptyQuick };
