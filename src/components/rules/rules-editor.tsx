"use client";
import { FlaskConical, Plus, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { APPLE_MODELS } from "@/lib/catalog/apple";
import { api } from "@/lib/client-api";
import type { BasePrice, RulesConfig } from "@/lib/rules/config";
import { parsePriceCsv } from "@/lib/rules/csv";
import type { Verdict } from "@/lib/rules/verdict";

const STATUS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" | "accent" }> = {
  high: { label: "💰 Hoge marge", tone: "success" }, match: { label: "Voldoet", tone: "success" }, review: { label: "Handmatig controleren", tone: "warning" },
  reject: { label: "Afgewezen", tone: "danger" }, skip: { label: "Geen oordeel (basisprijs ontbreekt)", tone: "neutral" },
};
const euro = (n: number | null | undefined) => (n == null ? "—" : `€${Math.round(n * 100) / 100}`);
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export function RulesEditor({ initialRules, initialPrices, isAdmin }: { initialRules: RulesConfig; initialPrices: BasePrice[]; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [rules, setRules] = React.useState<RulesConfig>(initialRules);
  const [prices, setPrices] = React.useState<BasePrice[]>(initialPrices);
  const [advanced, setAdvanced] = React.useState(JSON.stringify(initialRules, null, 2));
  const [paste, setPaste] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");

  const setR = (fn: (r: RulesConfig) => RulesConfig) => setRules((r) => { const n = fn(r); setAdvanced(JSON.stringify(n, null, 2)); return n; });
  const wrap = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(null); } };

  const savePrices = () => wrap("prices", async () => { const r = await api<{ prices: BasePrice[] }>("/api/rules/prices", { method: "PUT", body: { prices } }); setPrices(r.prices); toast(`${r.prices.length} basisprijzen opgeslagen`); router.refresh(); });
  const saveRules = () => wrap("rules", async () => { const r = await api<{ rules: RulesConfig }>("/api/rules", { method: "PUT", body: rules }); setRules(r.rules); setAdvanced(JSON.stringify(r.rules, null, 2)); toast("Inkoopregels opgeslagen"); router.refresh(); });
  const applyAdvanced = () => { try { const p = JSON.parse(advanced); setRules(p); toast("JSON overgenomen — klik op Opslaan om te bewaren"); } catch { toast("Ongeldige JSON", "err"); } };
  const importCsv = () => { const r = parsePriceCsv(paste); if (r.errors.length) toast(r.errors.slice(0, 3).join(" · "), "err"); if (r.rows.length) { const map = new Map(prices.map((p) => [`${p.modelKey}|${p.storageGb}|${p.variant}`, p])); for (const x of r.rows) map.set(`${x.modelKey}|${x.storageGb}|${x.variant}`, x); setPrices([...map.values()]); setPaste(""); toast(`${r.rows.length} regels toegevoegd — klik op Opslaan`); } };

  const shown = prices.map((p, i) => ({ p, i })).filter(({ p }) => !filter || p.modelKey.includes(filter.toLowerCase()) || (APPLE_MODELS.find((m) => m.key === p.modelKey)?.label ?? "").toLowerCase().includes(filter.toLowerCase()));
  const setPrice = (i: number, patch: Partial<BasePrice>) => setPrices((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // ---- tester ----
  const [t, setT] = React.useState({ modelKey: "iphone-15-pro", storageGb: "256", battery: "", ask: "", bid: "", km: "", text: "", ship: false, age: "", reviews: "", rating: "", verified: "" });
  const [res, setRes] = React.useState<{ verdict: Verdict; priceFromText: { ask: number | null; bid: number | null } | null } | null>(null);
  const runTest = () => wrap("test", async () => setRes(await api("/api/rules/test", { body: { modelKey: t.modelKey, storageGb: num(t.storageGb), batteryPct: num(t.battery), askEuro: num(t.ask), bidEuro: num(t.bid), distanceKm: num(t.km), text: t.text, shippingOffered: t.ship, seller: { ageMonths: num(t.age), reviews: num(t.reviews), rating: num(t.rating), verified: t.verified === "" ? null : t.verified === "ja" } } })));
  const [replay, setReplay] = React.useState<{ total: number; counts: Record<string, number>; topRejectReasons: Array<{ reason: string; n: number }>; examples: Array<{ id: string; title: string; status: string; askEuro: number | null; maxSellEuro: number | null; reason: string }> } | null>(null);
  const runReplay = () => wrap("replay", async () => setReplay(await api("/api/rules/replay", { body: { limit: 400, rules } })));

  const numField = (label: string, get: () => number, set: (v: number) => void, hint?: string, step = "1") => (
    <Field label={label} hint={hint}><Input type="number" step={step} value={get()} disabled={!isAdmin} onChange={(e) => set(Number(e.target.value))} /></Field>
  );

  return (
    <div className="space-y-6">
      {!isAdmin && <Notice tone="info">Je kunt alles bekijken en testen. Alleen een beheerder kan wijzigingen opslaan.</Notice>}

      <Card>
        <CardHeader>
          <div><CardTitle>Basisprijzen</CardTitle><CardDescription>Per model en opslag de verkoopprijs voor een toestel in <b>perfecte staat</b> (100% batterij, krasvrij). Batterij, krassen en afstand gaan daar vanaf. “Inkoop” = maximale inkoopprijs (zoals de iPad-lijst): daar gaat geen marge meer af.</CardDescription></div>
          {isAdmin && <Button onClick={savePrices} loading={busy === "prices"}><Save className="h-4 w-4" />Opslaan</Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          {prices.length === 0 && <Notice tone="warning">Nog geen basisprijzen. Zonder basisprijs voor een model/opslag blijft de bestaande waardering gelden.</Notice>}
          <Input placeholder="Zoek model…" aria-label="Zoek model" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-96 overflow-auto rounded-2xl border border-card-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 bg-muted-bg text-left text-xs text-muted"><tr><th className="px-3 py-2">Model</th><th className="px-3 py-2">Opslag</th><th className="px-3 py-2">Maat</th><th className="px-3 py-2">Prijs €</th><th className="px-3 py-2">Soort</th><th /></tr></thead>
              <tbody>
                {shown.map(({ p, i }) => (
                  <tr key={i} className="border-t border-card-border">
                    <td className="px-3 py-1.5"><Select aria-label="Model" value={p.modelKey} disabled={!isAdmin} onChange={(e) => setPrice(i, { modelKey: e.target.value })}>{!APPLE_MODELS.some((m) => m.key === p.modelKey) && <option value={p.modelKey}>{p.modelKey}</option>}{APPLE_MODELS.filter((m) => ["iphone", "ipad", "macbook_air", "macbook_pro", "mac_mini", "imac", "mac_studio", "watch"].includes(m.family)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></td>
                    <td className="px-3 py-1.5"><Input className="w-24" type="number" aria-label="Opslag GB" value={p.storageGb} disabled={!isAdmin} onChange={(e) => setPrice(i, { storageGb: Number(e.target.value) })} /></td>
                    <td className="px-3 py-1.5"><Input className="w-16" aria-label="Schermmaat" placeholder="—" value={p.variant} disabled={!isAdmin} onChange={(e) => setPrice(i, { variant: e.target.value })} /></td>
                    <td className="px-3 py-1.5"><Input className="w-28" type="number" aria-label="Prijs" value={p.priceEuro} disabled={!isAdmin} onChange={(e) => setPrice(i, { priceEuro: Number(e.target.value) })} /></td>
                    <td className="px-3 py-1.5"><Select aria-label="Soort" value={p.kind} disabled={!isAdmin} onChange={(e) => setPrice(i, { kind: e.target.value as "sell" | "buy" })}><option value="sell">Verkoop</option><option value="buy">Inkoop</option></Select></td>
                    <td className="px-2">{isAdmin && <button type="button" aria-label="Regel verwijderen" className="rounded-lg p-2 text-muted hover:bg-muted-bg hover:text-danger" onClick={() => setPrices((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setPrices((l) => [...l, { modelKey: "iphone-15-pro", storageGb: 256, variant: "", priceEuro: 0, kind: "sell" }])}><Plus className="h-4 w-4" />Regel toevoegen</Button>
              <Field label="Lijst plakken" hint="Eén regel per prijs: model;opslag;prijs of model;opslag;maat;prijs — optioneel ;inkoop erachter. Model mag de naam zijn (iPhone 15 Pro) of de sleutel."><Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"iPhone 15 Pro;256;700\niPhone 14;128;300"} /></Field>
              <Button variant="secondary" size="sm" onClick={importCsv} disabled={!paste.trim()}><Upload className="h-4 w-4" />Toevoegen aan lijst</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Regels</CardTitle><CardDescription>Standaardwaarden uit het Best Buy Phone-document. Elke waarde is aanpasbaar.</CardDescription></div>
          {isAdmin && <Button onClick={saveRules} loading={busy === "rules"}><Save className="h-4 w-4" />Opslaan</Button>}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-6">
            <Switch checked={rules.enabled} onChange={(v) => setR((r) => ({ ...r, enabled: v }))} label="Inkoopregels aan" disabled={!isAdmin} />
            <Switch checked={rules.replaceDistancePolicy} onChange={(v) => setR((r) => ({ ...r, replaceDistancePolicy: v }))} label="Regels vervangen het eerdere afstandsbeleid" disabled={!isAdmin} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Zoekprijs betekent"><Select value={rules.priceBase} disabled={!isAdmin} onChange={(e) => setR((r) => ({ ...r, priceBase: e.target.value as "sell" | "buy85" }))}><option value="sell">Verkoopprijs in perfecte staat (nieuwe manier)</option><option value="buy85">Max inkoop bij 85% batterij (oude vuistregel)</option></Select></Field>
            <Field label="Margetabel" hint="A = tabel uit de mail; B = tabel van de 💰-indicator"><Select value={rules.marginTable} disabled={!isAdmin} onChange={(e) => setR((r) => ({ ...r, marginTable: e.target.value as "A" | "B" }))}><option value="A">A</option><option value="B">B</option></Select></Field>
            <Field label="Zonder basisprijs"><Select value={rules.unknownBase} disabled={!isAdmin} onChange={(e) => setR((r) => ({ ...r, unknownBase: e.target.value as "fallback" | "skip" }))}><option value="fallback">Bestaande waardering gebruiken</option><option value="skip">Afwijzen</option></Select></Field>
            <Field label="Hoge marge: extra voor bieden vanaf"><Select value={rules.highMarginBidMode} disabled={!isAdmin} onChange={(e) => setR((r) => ({ ...r, highMarginBidMode: e.target.value as "same" | "table" }))}><option value="same">Zelfde als vraagprijs (zoals in het voorbeeld)</option><option value="table">Eigen kolom uit de tabel</option></Select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {numField("Batterij: nooit kopen onder %", () => rules.battery.excludeBelowPct, (v) => setR((r) => ({ ...r, battery: { ...r.battery, excludeBelowPct: v } })))}
            {numField("Batterij aangenomen 100% tot (maanden)", () => rules.battery.fullUntilMonths, (v) => setR((r) => ({ ...r, battery: { ...r.battery, fullUntilMonths: v } })))}
            {numField("…daarna daling per maand (%)", () => rules.battery.dropPerMonthPct, (v) => setR((r) => ({ ...r, battery: { ...r.battery, dropPerMonthPct: v } })), undefined, "0.1")}
            {numField("Batterij ondergrens aanname (%)", () => rules.battery.floorPct, (v) => setR((r) => ({ ...r, battery: { ...r.battery, floorPct: v } })))}
            {numField("Kras onbekend: aftrek €", () => rules.scratch.unknownEuro, (v) => setR((r) => ({ ...r, scratch: { ...r.scratch, unknownEuro: v } })))}
            {numField("Met krassen: aftrek €", () => rules.scratch.scratchedEuro, (v) => setR((r) => ({ ...r, scratch: { ...r.scratch, scratchedEuro: v } })))}
            {numField("Ophalen tot (km, hemelsbreed)", () => rules.distance.pickupMaxKm, (v) => setR((r) => ({ ...r, distance: { ...r.distance, pickupMaxKm: v } })))}
            {numField("Maximaal (km, verzenden)", () => rules.distance.maxKmDefault, (v) => setR((r) => ({ ...r, distance: { ...r.distance, maxKmDefault: v } })))}
            {numField("Nieuwste Pro/Pro Max maximaal (km)", () => rules.distance.newestProMaxKm, (v) => setR((r) => ({ ...r, distance: { ...r.distance, newestProMaxKm: v } })))}
            {numField("Rijfilter: € per km", () => rules.distance.perKmEuro, (v) => setR((r) => ({ ...r, distance: { ...r.distance, perKmEuro: v } })), "Gaat van de maximale prijs af als de verkoper niet aan het verzendfilter voldoet", "0.1")}
            {numField("Minimumprijs nieuwere modellen €", () => rules.minPrice.newerEuro, (v) => setR((r) => ({ ...r, minPrice: { ...r.minPrice, newerEuro: v } })))}
            {numField("Minimumprijs oudere modellen €", () => rules.minPrice.olderEuro, (v) => setR((r) => ({ ...r, minPrice: { ...r.minPrice, olderEuro: v } })))}
            {numField("Bieden vanaf onder … van vraagprijs", () => rules.bid.minShareOfAsk, (v) => setR((r) => ({ ...r, bid: { ...r.bid, minShareOfAsk: v } })), "0,65 = 65%", "0.01")}
            {numField("Gat vraag/bieden maximaal €", () => rules.bid.maxGapEuro, (v) => setR((r) => ({ ...r, bid: { ...r.bid, maxGapEuro: v } })))}
            {numField("Hoge marge: minimaal vraagprijs-marge €", () => rules.highMargin.minAskMarginEuro, (v) => setR((r) => ({ ...r, highMargin: { ...r.highMargin, minAskMarginEuro: v } })))}
            {numField("Hoge marge: minimaal bieden-marge €", () => rules.highMargin.minBidMarginEuro, (v) => setR((r) => ({ ...r, highMargin: { ...r.highMargin, minBidMarginEuro: v } })))}
            {numField("iPad cellular (4G/5G) bij €", () => rules.ipad.cellularBonusEuro, (v) => setR((r) => ({ ...r, ipad: { ...r.ipad, cellularBonusEuro: v } })))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Verzendfilter naar accountleeftijd</p>
            <p className="mb-3 text-xs text-muted">Onder {Math.round(rules.shipping.neverBelowMonths / 12 * 10) / 10} jaar actief: nooit laten verzenden. Alleen adverteerders waarvan de bron reviews en accountleeftijd levert kunnen goedgekeurd worden; zonder die gegevens krijgt de advertentie “Verkoper handmatig controleren”.</p>
            <div className="overflow-auto rounded-2xl border border-card-border">
              <table className="w-full min-w-[480px] text-sm"><thead className="bg-muted-bg text-left text-xs text-muted"><tr><th className="px-3 py-2">Vanaf (maanden)</th><th className="px-3 py-2">Reviews</th><th className="px-3 py-2">Sterren</th><th className="px-3 py-2">ID nodig</th></tr></thead>
                <tbody>{rules.shipping.tiers.map((tier, i) => (
                  <tr key={i} className="border-t border-card-border">
                    {(["fromMonths", "minReviews", "minRating"] as const).map((k) => <td key={k} className="px-3 py-1.5"><Input className="w-24" type="number" step={k === "minRating" ? "0.1" : "1"} aria-label={k} disabled={!isAdmin} value={tier[k]} onChange={(e) => setR((r) => ({ ...r, shipping: { ...r.shipping, tiers: r.shipping.tiers.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)) } }))} /></td>)}
                    <td className="px-3 py-1.5"><Switch checked={tier.requireVerified} disabled={!isAdmin} onChange={(v) => setR((r) => ({ ...r, shipping: { ...r.shipping, tiers: r.shipping.tiers.map((x, j) => (j === i ? { ...x, requireVerified: v } : x)) } }))} /></td>
                  </tr>))}</tbody></table>
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Geavanceerd (alle instellingen als JSON: kraswoorden, centra, MacBook, voorraad, maandaanpassing)</summary>
            <div className="mt-3 space-y-3"><Textarea className="min-h-72 font-mono text-xs" value={advanced} disabled={!isAdmin} onChange={(e) => setAdvanced(e.target.value)} />{isAdmin && <Button variant="outline" size="sm" onClick={applyAdvanced}>JSON overnemen</Button>}</div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-accent" />Regels testen</CardTitle><CardDescription>Vul een advertentie in en zie precies hoe de maximale prijs wordt opgebouwd. Er wordt niets opgeslagen of gemeld.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Model"><Select value={t.modelKey} onChange={(e) => setT({ ...t, modelKey: e.target.value })}>{APPLE_MODELS.filter((m) => ["iphone", "ipad", "macbook_air", "macbook_pro", "mac_mini", "imac"].includes(m.family)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></Field>
            <Field label="Opslag (GB)"><Input value={t.storageGb} onChange={(e) => setT({ ...t, storageGb: e.target.value })} placeholder="leeg = onbekend" /></Field>
            <Field label="Batterij %"><Input value={t.battery} onChange={(e) => setT({ ...t, battery: e.target.value })} placeholder="leeg = onbekend" /></Field>
            <Field label="Vraagprijs €"><Input value={t.ask} onChange={(e) => setT({ ...t, ask: e.target.value })} /></Field>
            <Field label="Bieden vanaf €"><Input value={t.bid} onChange={(e) => setT({ ...t, bid: e.target.value })} /></Field>
            <Field label="Afstand km"><Input value={t.km} onChange={(e) => setT({ ...t, km: e.target.value })} /></Field>
            <Field label="Account (maanden)"><Input value={t.age} onChange={(e) => setT({ ...t, age: e.target.value })} /></Field>
            <Field label="Reviews"><Input value={t.reviews} onChange={(e) => setT({ ...t, reviews: e.target.value })} /></Field>
            <Field label="Sterren"><Input value={t.rating} onChange={(e) => setT({ ...t, rating: e.target.value })} /></Field>
          </div>
          <Field label="Titel + omschrijving" hint="Hieruit komen krassen, krasvrij en — als er geen prijs is — de prijs"><Textarea value={t.text} onChange={(e) => setT({ ...t, text: e.target.value })} /></Field>
          <div className="flex flex-wrap items-center gap-5"><Switch checked={t.ship} onChange={(v) => setT({ ...t, ship: v })} label="Verzending mogelijk" /><Field label="ID geverifieerd"><Select value={t.verified} onChange={(e) => setT({ ...t, verified: e.target.value })}><option value="">onbekend</option><option value="ja">ja</option><option value="nee">nee</option></Select></Field><Button onClick={runTest} loading={busy === "test"}>Beoordeel</Button></div>
          {res && <VerdictView v={res.verdict} fromText={res.priceFromText} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Testen op bestaande advertenties</CardTitle><CardDescription>Beoordeelt de laatste 400 advertenties opnieuw met de regels zoals hierboven ingesteld (ook als je ze nog niet hebt opgeslagen).</CardDescription></div><Button variant="secondary" onClick={runReplay} loading={busy === "replay"}>Controleren</Button></CardHeader>
        {replay && (
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">{Object.entries(replay.counts).map(([k, n]) => <Badge key={k} tone={STATUS[k]?.tone}>{STATUS[k]?.label ?? k}: {n}</Badge>)}<Badge>{replay.total} advertenties</Badge></div>
            {replay.topRejectReasons.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{replay.topRejectReasons.map((r) => <li key={r.reason}>{r.n}× {r.reason}</li>)}</ul>}
            <ul className="divide-y divide-card-border rounded-2xl border border-card-border text-sm">{replay.examples.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2"><Badge tone={STATUS[e.status]?.tone}>{STATUS[e.status]?.label}</Badge><a className="min-w-0 flex-1 truncate hover:underline" href={`/ads/${e.id}`}>{e.title}</a><span className="text-muted">{euro(e.askEuro)} / max {euro(e.maxSellEuro)}</span>{e.reason && <span className="w-full text-xs text-muted">{e.reason}</span>}</li>)}</ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function VerdictView({ v, fromText }: { v: Verdict; fromText: { ask: number | null; bid: number | null } | null }) {
  const st = STATUS[v.status];
  return (
    <div className="space-y-3 rounded-2xl border border-card-border bg-ivory p-4 text-sm" role="status">
      <div className="flex flex-wrap items-center gap-2"><Badge tone={st.tone}>{st.label}</Badge>{v.flags.map((f) => <Badge key={f}>{f}</Badge>)}</div>
      {v.reasons.length > 0 && <ul className="list-disc pl-5">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {v.lines.length > 0 && (
        <table className="w-full max-w-md"><tbody>
          {v.lines.map((l, i) => <tr key={i}><td className="py-0.5 pr-3">{i === 0 ? "" : l.euro < 0 ? "− " : "+ "}{l.label}</td><td className="text-right tabular-nums">{euro(i === 0 ? l.euro : Math.abs(l.euro))}</td></tr>)}
          <tr className="border-t border-card-border font-semibold"><td className="py-1">Max {v.baseKind === "buy" ? "inkoopprijs" : "verkoopprijs"}</td><td className="text-right tabular-nums">{euro(v.maxSellEuro)}</td></tr>
          <tr><td>Toegestane vraagprijs</td><td className="text-right tabular-nums">{euro(v.allowedAsk)}</td></tr>
          <tr><td>Toegestane bieden vanaf</td><td className="text-right tabular-nums">{euro(v.allowedBid)}</td></tr>
          {v.highAsk != null && <tr><td>Hoge marge 💰 (vraag / bieden)</td><td className="text-right tabular-nums">{euro(v.highAsk)} / {euro(v.highBid)}</td></tr>}
          {v.marginEuro != null && <tr><td>Marge op deze prijs</td><td className="text-right tabular-nums">{euro(v.marginEuro)}</td></tr>}
        </tbody></table>
      )}
      {v.notes.length > 0 && <ul className="list-disc pl-5 text-muted">{v.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {fromText && <p className="text-muted">Prijs uit tekst: vraag {euro(fromText.ask)}, bieden vanaf {euro(fromText.bid)}</p>}
    </div>
  );
}
