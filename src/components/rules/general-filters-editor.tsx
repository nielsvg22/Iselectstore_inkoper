"use client";
import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import type { RulesConfig } from "@/lib/rules/config";

export interface VintedState {
  settings: { enabled: boolean; intervalSeconds: number; minGapSeconds: number; pages: number };
  profile: { id: string; active: boolean; lastCheckedAt: string | null; lastSuccessAt: string | null; lastError: string | null; queries: string[] } | null;
  cooldown: { until: string; reason: string } | null;
  health: { ok: boolean; lastOkAt: string | null; lastError: string | null; requestsToday: number } | null;
  adCount: number;
}

const POLICY = (
  <>
    <option value="show">Toch tonen</option>
    <option value="mark">Markeren als onbekend</option>
    <option value="exclude">Uitsluiten</option>
  </>
);
const list = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
function Fld({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-foreground/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function GeneralFiltersEditor({ initialRules, vinted, isAdmin }: { initialRules: RulesConfig; vinted: VintedState; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [r, setR] = React.useState<RulesConfig>(initialRules);
  const [v, setV] = React.useState(vinted);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [acc, setAcc] = React.useState({ terms: r.accessories.terms.join(", "), parts: r.accessories.partsTerms.join(", "), incl: r.accessories.includeMarkers.join(", "), without: r.accessories.withoutMarkers.join(", ") });
  const [countries, setCountries] = React.useState(r.country.allowed.join(", "));
  const wrap = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(null); } };
  const num = (x: string) => (x.trim() === "" ? 0 : Number(x.replace(",", ".")));
  const set = <K extends keyof RulesConfig>(k: K, patch: Partial<RulesConfig[K]>) => setR((p) => ({ ...p, [k]: { ...(p[k] as object), ...(patch as object) } }));

  const save = () => wrap("save", async () => {
    const next: RulesConfig = {
      ...r,
      accessories: { ...r.accessories, terms: list(acc.terms), partsTerms: list(acc.parts), includeMarkers: list(acc.incl), withoutMarkers: list(acc.without) },
      country: { ...r.country, allowed: list(countries.toUpperCase()) },
    };
    const saved = await api<{ rules: RulesConfig }>("/api/rules", { method: "PUT", body: next });
    setR(saved.rules);
    toast("Algemene filters opgeslagen");
    router.refresh();
  });
  const vintedApply = (body: Record<string, unknown>) => wrap("vinted", async () => {
    const res = await api<{ status: VintedState }>("/api/profiles/vinted", { body });
    setV(res.status);
    toast(body.enabled === false ? "Vinted uitgezet" : "Vinted-radar bijgewerkt");
    router.refresh();
  });

  const costs = (pf: "marktplaats" | "vinted") => (
    <div className="grid gap-3 sm:grid-cols-4">
      {([["shippingEuro", "Verzendkosten €"], ["protectionPct", "Kopersbescherming %"], ["protectionFixedEuro", "Kopersbescherming vast €"], ["otherEuro", "Overige kosten €"]] as const).map(([k, label]) => (
        <Fld key={k} label={label}><Input type="number" step="0.01" min="0" disabled={!isAdmin} value={r.margin.costs[pf][k]} onChange={(e) => setR((p) => ({ ...p, margin: { ...p.margin, costs: { ...p.margin.costs, [pf]: { ...p.margin.costs[pf], [k]: num(e.target.value) } } } }))} /></Fld>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><div><CardTitle>Platforms</CardTitle><CardDescription>Marktplaats werkt zoals altijd. Vinted staat standaard uit: alleen openbare pagina&apos;s van vinted.nl, volgens robots.txt, met eigen requestlimiet en automatische pauze bij HTTP 403/429. Er wordt niets omzeild.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <Switch checked={v.settings.enabled} onChange={(on) => vintedApply({ enabled: on })} label="Vinted aan" disabled={!isAdmin || busy === "vinted"} />
            <span className="text-sm text-muted">{v.profile ? `Zoekprofiel actief · laatste controle ${v.profile.lastCheckedAt ? new Date(v.profile.lastCheckedAt).toLocaleTimeString("nl-NL") : "nog niet"}` : "Nog geen Vinted-zoekprofiel"} · {v.adCount} Vinted-advertenties opgeslagen</span>
          </div>
          {v.cooldown && <Notice tone="warning">Vinted is gepauzeerd tot {new Date(v.cooldown.until).toLocaleTimeString("nl-NL")}: {v.cooldown.reason}. De app probeert dit niet te omzeilen.</Notice>}
          {v.profile?.lastError && <Notice tone="danger">Laatste fout: {v.profile.lastError}</Notice>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Fld label="Controle elke (seconden)" hint="Minimaal 30. Marktplaats heeft een eigen interval."><Input type="number" min={30} disabled={!isAdmin} value={v.settings.intervalSeconds} onChange={(e) => setV({ ...v, settings: { ...v.settings, intervalSeconds: Number(e.target.value) } })} /></Fld>
            <Fld label="Minimale tijd tussen requests (seconden)" hint="Alle Vinted-requests samen"><Input type="number" min={3} disabled={!isAdmin} value={v.settings.minGapSeconds} onChange={(e) => setV({ ...v, settings: { ...v.settings, minGapSeconds: Number(e.target.value) } })} /></Fld>
            <Fld label="Pagina's per zoekterm" hint="Nieuwste eerst; 1 volstaat om nieuwe advertenties te zien"><Input type="number" min={1} max={5} disabled={!isAdmin} value={v.settings.pages} onChange={(e) => setV({ ...v, settings: { ...v.settings, pages: Number(e.target.value) } })} /></Fld>
          </div>
          {isAdmin && <Button variant="outline" loading={busy === "vinted"} onClick={() => vintedApply({ enabled: v.settings.enabled, intervalSeconds: v.settings.intervalSeconds, minGapSeconds: v.settings.minGapSeconds, pages: v.settings.pages })}>{v.profile ? "Vinted-radar bijwerken" : "Vinted-radar aanmaken"}</Button>}
          {v.profile && <p className="text-xs text-muted">Zoektermen (uit de actieve modellenlijst): {v.profile.queries.join(", ")}. Niet beschikbaar op Vinted: afstand en locatie, accountleeftijd en land van de verkoper; die filters kunnen daar niet worden toegepast en sluiten nooit ten onrechte uit.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Accessoires en onderdelen uitsluiten</CardTitle><CardDescription>&quot;iPhone 15 Pro inclusief hoesje&quot; blijft toegestaan; &quot;iPhone 15 Pro hoesje&quot; en &quot;Hoesje voor iPhone&quot; niet. De herkenning gebruikt titel, omschrijving, opslag en prijs.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <Switch checked={r.accessories.enabled} onChange={(on) => set("accessories", { enabled: on })} label="Accessoires uitsluiten" disabled={!isAdmin} />
            <Switch checked={r.accessories.excludeDefect} onChange={(on) => set("accessories", { excludeDefect: on })} label='Ook "defect"/"kapot" uitsluiten' disabled={!isAdmin} />
          </div>
          <Fld label="Accessoire-woorden (komma of nieuwe regel)"><Textarea aria-label="Accessoire-woorden" rows={4} disabled={!isAdmin} value={acc.terms} onChange={(e) => setAcc({ ...acc, terms: e.target.value })} /></Fld>
          <Fld label="Onderdelen en lege doos"><Textarea aria-label="Onderdelen" rows={3} disabled={!isAdmin} value={acc.parts} onChange={(e) => setAcc({ ...acc, parts: e.target.value })} /></Fld>
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label='Woorden die "meegeleverd" betekenen'><Textarea aria-label="Meegeleverd-woorden" rows={2} disabled={!isAdmin} value={acc.incl} onChange={(e) => setAcc({ ...acc, incl: e.target.value })} /></Fld>
            <Fld label='Woorden die "zonder" betekenen'><Textarea aria-label="Zonder-woorden" rows={2} disabled={!isAdmin} value={acc.without} onChange={(e) => setAcc({ ...acc, without: e.target.value })} /></Fld>
          </div>
          <Fld label="Minimumprijs voor een apparaat zonder opslag in de titel (€)" hint="Onder dit bedrag, met een accessoire-woord en zonder opslag, geldt het als accessoire (of de minimumprijs van het model)"><Input type="number" min="0" className="max-w-40" disabled={!isAdmin} value={r.accessories.minDevicePriceEuro} onChange={(e) => set("accessories", { minDevicePriceEuro: num(e.target.value) })} /></Fld>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Winstmarge</CardTitle><CardDescription>Verwachte winst = doorverkoopprijs − inkoopprijs − bijkomende kosten. De doorverkoopprijs en gewenste marge per model staan in de <a className="underline" href="/rules/zoekfilters">modellenlijst</a>; zonder marge bij het model geldt het segment of de standaardmarge.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <Switch checked={r.margin.enabled} onChange={(on) => set("margin", { enabled: on })} label="Margefilter aan" disabled={!isAdmin} />
            <Switch checked={r.margin.useListedPlatformCosts} onChange={(on) => set("margin", { useListedPlatformCosts: on })} label="Vinted: kosten uit de advertentie gebruiken" disabled={!isAdmin} />
          </div>
          <Fld label="Standaard minimale marge (€)" hint="Als het model geen eigen marge heeft en geen segment past"><Input type="number" min="0" className="max-w-40" disabled={!isAdmin} value={r.margin.defaultMinMarginEuro} onChange={(e) => set("margin", { defaultMinMarginEuro: num(e.target.value) })} /></Fld>
          <div>
            <p className="mb-2 text-sm font-semibold">Minimale marge per verkoopprijssegment</p>
            {r.margin.segments.map((s, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                Vanaf doorverkoopprijs €<Input aria-label="Vanaf doorverkoopprijs" type="number" min="0" className="w-28" disabled={!isAdmin} value={s.fromResaleEuro} onChange={(e) => setR((p) => ({ ...p, margin: { ...p.margin, segments: p.margin.segments.map((x, j) => (j === i ? { ...x, fromResaleEuro: num(e.target.value) } : x)) } }))} />
                minimale marge €<Input aria-label="Minimale marge" type="number" min="0" className="w-28" disabled={!isAdmin} value={s.minMarginEuro} onChange={(e) => setR((p) => ({ ...p, margin: { ...p.margin, segments: p.margin.segments.map((x, j) => (j === i ? { ...x, minMarginEuro: num(e.target.value) } : x)) } }))} />
                {isAdmin && <button type="button" aria-label="Segment verwijderen" className="rounded-lg p-2 text-muted hover:bg-muted-bg hover:text-danger" onClick={() => setR((p) => ({ ...p, margin: { ...p.margin, segments: p.margin.segments.filter((_, j) => j !== i) } }))}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {isAdmin && <Button variant="outline" size="sm" onClick={() => setR((p) => ({ ...p, margin: { ...p.margin, segments: [...p.margin.segments, { fromResaleEuro: 0, minMarginEuro: 0 }] } }))}><Plus className="h-4 w-4" />Segment toevoegen</Button>}
          </div>
          <div><p className="mb-2 text-sm font-semibold">Inkoopkosten Marktplaats</p>{costs("marktplaats")}</div>
          <div><p className="mb-2 text-sm font-semibold">Inkoopkosten Vinted</p>{costs("vinted")}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Batterij, land, bescherming en verkoper</CardTitle><CardDescription>Een percentage telt alleen als het echt in de advertentie staat. Onbekende gegevens worden nooit als aanwezig beschouwd.</CardDescription></div></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label="Minimale batterijconditie (%)" hint="0 = geen filter"><Input type="number" min="0" max="100" disabled={!isAdmin} value={r.battery.filterMinPct} onChange={(e) => set("battery", { filterMinPct: num(e.target.value) })} /></Fld>
            <Fld label="Batterijconditie niet genoemd"><Select disabled={!isAdmin} value={r.battery.unknownPolicy} onChange={(e) => set("battery", { unknownPolicy: e.target.value as RulesConfig["battery"]["unknownPolicy"] })}>{POLICY}</Select></Fld>
            <Fld label="Toegestane landen (ISO, komma)" hint="Standaard NL. Marktplaats is altijd Nederland; Vinted geeft het land niet per advertentie"><Input aria-label="Toegestane landen" disabled={!isAdmin} value={countries} onChange={(e) => setCountries(e.target.value)} /></Fld>
            <Fld label="Land onbekend"><Select disabled={!isAdmin} value={r.country.unknownPolicy} onChange={(e) => set("country", { unknownPolicy: e.target.value as RulesConfig["country"]["unknownPolicy"] })}>{POLICY}</Select></Fld>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Vinted: kopersbescherming en elektronicaverificatie (afzonderlijk gecontroleerd)</p>
            <div className="flex flex-wrap gap-6">
              <Switch checked={r.protection.requireBuyerProtection} onChange={(on) => set("protection", { requireBuyerProtection: on })} label="Alleen met kopersbescherming" disabled={!isAdmin} />
              <Switch checked={r.protection.requireElectronicsVerification} onChange={(on) => set("protection", { requireElectronicsVerification: on })} label="Alleen met elektronicaverificatie" disabled={!isAdmin} />
            </div>
            <Fld label="Onbekend (niet bevestigd)"><Select className="max-w-xs" disabled={!isAdmin} value={r.protection.unknownPolicy} onChange={(e) => set("protection", { unknownPolicy: e.target.value as RulesConfig["protection"]["unknownPolicy"] })}>{POLICY}</Select></Fld>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Fld label="Minimale verkopersbeoordeling (sterren)" hint="0 = geen eis"><Input type="number" min="0" max="5" step="0.1" disabled={!isAdmin} value={r.sellerFilter.minRating} onChange={(e) => set("sellerFilter", { minRating: num(e.target.value) })} /></Fld>
            <Fld label="Minimaal aantal beoordelingen" hint="0 = geen eis"><Input type="number" min="0" disabled={!isAdmin} value={r.sellerFilter.minReviews} onChange={(e) => set("sellerFilter", { minReviews: num(e.target.value) })} /></Fld>
            <Fld label="Beoordeling onbekend"><Select disabled={!isAdmin} value={r.sellerFilter.unknownPolicy} onChange={(e) => set("sellerFilter", { unknownPolicy: e.target.value as RulesConfig["sellerFilter"]["unknownPolicy"] })}>{POLICY}</Select></Fld>
          </div>
        </CardContent>
      </Card>
      {isAdmin && <div className="sticky bottom-4"><Button size="lg" onClick={save} loading={busy === "save"}><Save className="h-4 w-4" />Algemene filters opslaan</Button></div>}
    </div>
  );
}
