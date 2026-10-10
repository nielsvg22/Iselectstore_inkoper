"use client";
import { KeyRound, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import type { AppConfig } from "@/lib/config/schema";

type Secrets = Record<string, boolean>;
const ORIGINS: Array<[AppConfig["sources"]["allowed"][number], string]> = [["SEARCH", "Zoeken op Marktplaats (zoekopdrachten)"], ["MANUAL_URL", "Advertentie-URL's"], ["IMPORT", "Bestandsimport (JSON/CSV)"], ["FEED", "Feeds (JSON/CSV-URL)"], ["DEMO", "Demonstratiedata"], ["PARTNER_API", "Officiële partner-API (vereist toegang)"]];

export function SettingsForm({ initial, secrets, isAdmin }: { initial: AppConfig; secrets: Secrets; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = React.useState<AppConfig>(initial);
  const [sec, setSec] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const set = <K extends keyof AppConfig>(k: K, patch: Partial<AppConfig[K]>) => setC((s) => ({ ...s, [k]: { ...(s[k] as object), ...patch } }));
  const euro = (cents: number) => String(cents / 100);
  const cents = (v: string) => Math.round(Number(v || 0) * 100);

  async function save() {
    setBusy("save");
    try {
      const secrets: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(sec)) if (v.trim() !== "") secrets[k] = v.trim();
      await api("/api/settings", { method: "PUT", body: { config: c, secrets } });
      setSec({});
      toast("Instellingen opgeslagen");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }
  async function clearSecret(k: string) {
    setBusy(k);
    try {
      await api("/api/settings", { method: "PUT", body: { secrets: { [k]: null } } });
      toast("Geheim verwijderd");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }
  const SecretField = ({ k, label, hint, placeholder }: { k: string; label: string; hint?: string; placeholder: string }) => (
    <Field label={label} hint={hint} htmlFor={`s-${k}`}>
      <div className="flex gap-2">
        <Input id={`s-${k}`} type="password" autoComplete="off" disabled={!isAdmin} placeholder={secrets[k] ? "•••••••• (ingesteld — typ om te vervangen)" : placeholder} value={sec[k] ?? ""} onChange={(e) => setSec({ ...sec, [k]: e.target.value })} />
        {secrets[k] && isAdmin && <Button type="button" variant="outline" size="md" loading={busy === k} onClick={() => clearSecret(k)}>Wissen</Button>}
      </div>
      <div className="mt-1.5"><Badge tone={secrets[k] ? "success" : "neutral"}><KeyRound className="h-3 w-3" />{secrets[k] ? "Ingesteld (versleuteld opgeslagen, nooit zichtbaar)" : "Niet ingesteld"}</Badge></div>
    </Field>
  );
  const test = async (channel: "TELEGRAM" | "DISCORD") => {
    setBusy(channel);
    try {
      await api("/api/settings/test-notification", { body: { channel } });
      toast("Testmelding verzonden");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };
  const w = c.scoring.weights;
  const wSum = w.roi + w.profit + w.certainty + w.condition + w.sellability + w.risk;

  return (
    <div className="space-y-6">
      {!isAdmin && <Notice tone="warning">Alleen beheerders kunnen instellingen wijzigen.</Notice>}
      <fieldset disabled={!isAdmin} className="space-y-6">
        <Card>
          <CardHeader><div><CardTitle>Winstdoelen &amp; zoekinstellingen</CardTitle><CardDescription>Standaardwaarden voor analyse, scoring en filters.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Minimale winst (€)" htmlFor="t-profit"><Input id="t-profit" type="number" min="0" value={euro(c.targets.minProfitCents)} onChange={(e) => set("targets", { minProfitCents: cents(e.target.value) })} /></Field>
            <Field label="Minimaal rendement (%)" htmlFor="t-roi"><Input id="t-roi" type="number" min="0" value={c.targets.minRoiPct} onChange={(e) => set("targets", { minRoiPct: Number(e.target.value) })} /></Field>
            <Field label="Minimale dealscore" htmlFor="t-score" hint="Vanaf deze score telt een deal als ‘interessant’."><Input id="t-score" type="number" min="0" max="100" value={c.targets.minDealScore} onChange={(e) => set("targets", { minDealScore: Number(e.target.value) })} /></Field>
            <Field label="Maximale inkoopprijs (€)" htmlFor="t-max"><Input id="t-max" type="number" min="0" value={euro(c.targets.maxBuyCents)} onChange={(e) => set("targets", { maxBuyCents: cents(e.target.value) })} /></Field>
            <Field label="Zoekradius (km)" htmlFor="t-rad"><Input id="t-rad" type="number" min="0" value={c.targets.searchRadiusKm} onChange={(e) => set("targets", { searchRadiusKm: Number(e.target.value) })} /></Field>
            <Field label="Standaardlocatie" htmlFor="t-loc"><Input id="t-loc" value={c.targets.defaultLocation} placeholder="Postcode of plaats" onChange={(e) => set("targets", { defaultLocation: e.target.value })} /></Field>
            <Field label="Risicotolerantie" htmlFor="t-risk" hint="Bepaalt hoe zwaar risico’s en onbekende gegevens meetellen.">
              <Select id="t-risk" value={c.targets.riskTolerance} onChange={(e) => set("targets", { riskTolerance: e.target.value as AppConfig["targets"]["riskTolerance"] })}><option value="low">Laag (voorzichtig)</option><option value="medium">Gemiddeld</option><option value="high">Hoog</option></Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Kosten &amp; belasting</CardTitle><CardDescription>Standaardkosten per transactie; per advertentie aan te passen. Berekeningen zijn indicatief en geen fiscaal advies.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Verzendkosten (€)" htmlFor="k-ship"><Input id="k-ship" type="number" min="0" value={euro(c.costs.shippingCents)} onChange={(e) => set("costs", { shippingCents: cents(e.target.value) })} /></Field>
              <Field label="Transportkosten (€)" htmlFor="k-tr"><Input id="k-tr" type="number" min="0" value={euro(c.costs.transportCents)} onChange={(e) => set("costs", { transportCents: cents(e.target.value) })} /></Field>
              <Field label="Overige kosten (€)" htmlFor="k-ot"><Input id="k-ot" type="number" min="0" value={euro(c.costs.otherCents)} onChange={(e) => set("costs", { otherCents: cents(e.target.value) })} /></Field>
              <Field label="Platformkosten (% van verkoop)" htmlFor="k-pf"><Input id="k-pf" type="number" min="0" step="0.1" value={c.costs.platformFeePct} onChange={(e) => set("costs", { platformFeePct: Number(e.target.value) })} /></Field>
              <Field label="Transactiekosten (% van verkoop)" htmlFor="k-tx"><Input id="k-tx" type="number" min="0" step="0.1" value={c.costs.transactionFeePct} onChange={(e) => set("costs", { transactionFeePct: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid gap-4 border-t border-card-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Btw-behandeling" htmlFor="x-vat" hint="‘Geen’ = btw niet meenemen als kostenpost.">
                <Select id="x-vat" value={c.tax.vatMode} onChange={(e) => set("tax", { vatMode: e.target.value as AppConfig["tax"]["vatMode"] })}><option value="none">Geen btw-kosten meenemen</option><option value="standard">Btw over volledige verkoopprijs</option><option value="margin">Margeregeling (indien van toepassing)</option></Select>
              </Field>
              <Field label="Btw-percentage" htmlFor="x-rate"><Input id="x-rate" type="number" min="0" max="30" value={c.tax.vatRatePct} onChange={(e) => set("tax", { vatRatePct: Number(e.target.value) })} /></Field>
              <div className="flex items-end pb-1"><Switch checked={c.tax.marginSchemeEligible} onChange={(v) => set("tax", { marginSchemeEligible: v })} label="Margeregeling is standaard van toepassing" /></div>
            </div>
            {c.tax.vatMode === "margin" && !c.tax.marginSchemeEligible && <Notice tone="info">De margeregeling wordt alleen toegepast als je bevestigt dat deze van toepassing is (hier of per advertentie). Anders wordt voorzichtig met btw over de volledige verkoopprijs gerekend.</Notice>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Scoring</CardTitle><CardDescription>Gewichten (worden genormaliseerd; nu totaal {wSum}) en grenzen per niveau.</CardDescription></div></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {([["roi", "Verwacht rendement"], ["profit", "Verwachte winst in euro’s"], ["certainty", "Zekerheid marktwaarde"], ["condition", "Productconditie"], ["sellability", "Verkoopbaarheid"], ["risk", "Advertentierisico"]] as const).map(([k, l]) => (
                <Field key={k} label={`${l} (gewicht)`} htmlFor={`w-${k}`}><Input id={`w-${k}`} type="number" min="0" value={w[k]} onChange={(e) => set("scoring", { weights: { ...w, [k]: Number(e.target.value) } })} /></Field>
              ))}
            </div>
            <div className="grid gap-4 border-t border-card-border pt-4 sm:grid-cols-4">
              {([["top", "Topdeal vanaf"], ["veryInteresting", "Zeer interessant vanaf"], ["interesting", "Interessant vanaf"], ["moderate", "Matig vanaf"]] as const).map(([k, l]) => (
                <Field key={k} label={l} htmlFor={`b-${k}`}><Input id={`b-${k}`} type="number" min="0" max="100" value={c.scoring.bands[k]} onChange={(e) => set("scoring", { bands: { ...c.scoring.bands, [k]: Number(e.target.value) } })} /></Field>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Marktwaardering &amp; reparaties</CardTitle><CardDescription>Aannames achter de waardering — pas aan op basis van je eigen ervaring.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Vraagprijs → verkoopprijs-factor" htmlFor="v-f" hint="0,92 = gemiddeld wordt 92% van de vraagprijs gerealiseerd."><Input id="v-f" type="number" min="0.5" max="1.1" step="0.01" value={c.valuation.askToRealizedFactor} onChange={(e) => set("valuation", { askToRealizedFactor: Number(e.target.value) })} /></Field>
            <Field label="Min. aantal vergelijkingen" htmlFor="v-n"><Input id="v-n" type="number" min="1" value={c.valuation.minComparables} onChange={(e) => set("valuation", { minComparables: Number(e.target.value) })} /></Field>
            <Field label="Maximale leeftijd data (dagen)" htmlFor="v-a"><Input id="v-a" type="number" min="7" value={c.valuation.maxAgeDays} onChange={(e) => set("valuation", { maxAgeDays: Number(e.target.value) })} /></Field>
            <Field label="Reparatie scherm (€)" htmlFor="r-s"><Input id="r-s" type="number" min="0" value={euro(c.repairCostsCents.screen)} onChange={(e) => set("repairCostsCents", { screen: cents(e.target.value) })} /></Field>
            <Field label="Reparatie achterkant (€)" htmlFor="r-b"><Input id="r-b" type="number" min="0" value={euro(c.repairCostsCents.back)} onChange={(e) => set("repairCostsCents", { back: cents(e.target.value) })} /></Field>
            <Field label="Reparatie camera (€)" htmlFor="r-c"><Input id="r-c" type="number" min="0" value={euro(c.repairCostsCents.camera)} onChange={(e) => set("repairCostsCents", { camera: cents(e.target.value) })} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Telegram &amp; meldingen</CardTitle><CardDescription>Maak een bot via @BotFather en haal je Chat ID op via @userinfobot of de getUpdates-API.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SecretField k="telegram.botToken" label="Telegram Bot Token" placeholder="123456789:AA…" />
              <Field label="Telegram Chat ID" htmlFor="tg-chat"><Input id="tg-chat" value={c.telegram.chatId} placeholder="123456789" onChange={(e) => set("telegram", { chatId: e.target.value })} /></Field>
              <SecretField k="discord.webhookUrl" label="Discord webhook-URL (optioneel)" placeholder="https://discord.com/api/webhooks/…" />
              <div className="space-y-3 pt-6">
                <Switch checked={c.notifications.enabled} onChange={(v) => set("notifications", { enabled: v })} label="Meldingen globaal aan" />
                <Field label="Minimaal niveau voor melding" htmlFor="n-band"><Select id="n-band" value={c.notifications.minBand} onChange={(e) => set("notifications", { minBand: e.target.value as AppConfig["notifications"]["minBand"] })}><option value="TOP">Alleen topdeals</option><option value="VERY_INTERESTING">Zeer interessant en hoger</option><option value="INTERESTING">Interessant en hoger</option></Select></Field>
                <div className="flex gap-4 text-sm">
                  {(["TELEGRAM", "DISCORD"] as const).map((ch) => (
                    <label key={ch} className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={c.notifications.channels.includes(ch)} onChange={(e) => set("notifications", { channels: e.target.checked ? [...c.notifications.channels, ch] : c.notifications.channels.filter((x) => x !== ch) })} />{ch === "TELEGRAM" ? "Telegram" : "Discord"}</label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-card-border pt-4">
              <Button type="button" variant="outline" size="sm" loading={busy === "TELEGRAM"} onClick={() => test("TELEGRAM")}><Send className="h-3.5 w-3.5" />Testmelding Telegram</Button>
              <Button type="button" variant="outline" size="sm" loading={busy === "DISCORD"} onClick={() => test("DISCORD")}><Send className="h-3.5 w-3.5" />Testmelding Discord</Button>
              <p className="w-full text-xs text-muted">Sla eerst op; de test gebruikt de opgeslagen gegevens. E-mail en Web Push zijn nog niet geïmplementeerd.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>AI-analyse</CardTitle><CardDescription>Optioneel. Regels herkennen de meeste advertenties zelf; AI wordt alleen gebruikt bij twijfel (en eventueel voor foto&apos;s). Betaalde API — kosten worden begrensd.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Provider" htmlFor="a-p"><Select id="a-p" value={c.ai.provider} onChange={(e) => set("ai", { provider: e.target.value as AppConfig["ai"]["provider"] })}><option value="none">Uit (alleen regels)</option><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="openai_compatible">OpenAI-compatibel</option></Select></Field>
              <Field label="Model" htmlFor="a-m" hint="Leeg = standaardmodel van de provider."><Input id="a-m" value={c.ai.model} onChange={(e) => set("ai", { model: e.target.value })} /></Field>
              {c.ai.provider === "openai_compatible" && <Field label="Basis-URL" htmlFor="a-u"><Input id="a-u" type="url" value={c.ai.baseUrl} placeholder="https://…" onChange={(e) => set("ai", { baseUrl: e.target.value })} /></Field>}
              <SecretField k="ai.apiKey" label="AI API Key" placeholder="sk-…" />
              <Field label="Max. aanroepen per dag" htmlFor="a-c"><Input id="a-c" type="number" min="0" value={c.ai.maxCallsPerDay} onChange={(e) => set("ai", { maxCallsPerDay: Number(e.target.value) })} /></Field>
              <Field label="Max. kosten per dag (€)" htmlFor="a-e"><Input id="a-e" type="number" min="0" step="0.5" value={c.ai.maxCostEurPerDay} onChange={(e) => set("ai", { maxCostEurPerDay: Number(e.target.value) })} /></Field>
              <Field label="Prijs invoer (€ per 1M tokens)" htmlFor="a-pi"><Input id="a-pi" type="number" min="0" step="0.1" value={c.ai.inputPricePerMTokEur} onChange={(e) => set("ai", { inputPricePerMTokEur: Number(e.target.value) })} /></Field>
              <Field label="Prijs uitvoer (€ per 1M tokens)" htmlFor="a-po"><Input id="a-po" type="number" min="0" step="0.1" value={c.ai.outputPricePerMTokEur} onChange={(e) => set("ai", { outputPricePerMTokEur: Number(e.target.value) })} /></Field>
            </div>
            <Switch checked={c.ai.analyzeImages} onChange={(v) => set("ai", { analyzeImages: v })} label="Foto’s meesturen voor schadeherkenning (hogere kosten)" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Toegestane databronnen &amp; verwerkingslimieten</CardTitle></div></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ORIGINS.map(([k, l]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={c.sources.allowed.includes(k)} onChange={(e) => set("sources", { allowed: e.target.checked ? [...c.sources.allowed, k] : c.sources.allowed.filter((x) => x !== k) })} />{l}</label>
              ))}
            </div>
            <Field label="Toegestane domeinen voor URL-import" htmlFor="u-al" hint="Komma-gescheiden. Subdomeinen zijn toegestaan.">
              <Input id="u-al" value={c.sources.urlAllowlist.join(", ")} onChange={(e) => set("sources", { urlAllowlist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Max. advertenties per run" htmlFor="l-ads"><Input id="l-ads" type="number" min="1" value={c.limits.maxAdsPerRun} onChange={(e) => set("limits", { maxAdsPerRun: Number(e.target.value) })} /></Field>
              <Field label="Requests per dag per bron" htmlFor="l-req"><Input id="l-req" type="number" min="1" value={c.limits.requestsPerDayPerSource} onChange={(e) => set("limits", { requestsPerDayPerSource: Number(e.target.value) })} /></Field>
              <Field label="Min. seconden tussen requests" htmlFor="l-gap"><Input id="l-gap" type="number" min="0" value={c.limits.minSecondsBetweenRequests} onChange={(e) => set("limits", { minSecondsBetweenRequests: Number(e.target.value) })} /></Field>
              <Field label="Jobs per verwerkingsronde" htmlFor="l-jobs"><Input id="l-jobs" type="number" min="1" value={c.limits.jobsPerTick} onChange={(e) => set("limits", { jobsPerTick: Number(e.target.value) })} /></Field>
              <Field label="Bewaartermijn advertenties (dagen)" htmlFor="l-ret" hint="Favorieten en inkopen blijven bewaard."><Input id="l-ret" type="number" min="7" value={c.limits.adRetentionDays} onChange={(e) => set("limits", { adRetentionDays: Number(e.target.value) })} /></Field>
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {isAdmin && (
        <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-3 rounded-3xl border border-card-border bg-card/90 p-3 shadow-pop backdrop-blur-xl lg:bottom-4">
          <Button size="lg" loading={busy === "save"} onClick={save}>Instellingen opslaan</Button>
          <Button
            variant="outline"
            size="lg"
            loading={busy === "re"}
            onClick={async () => {
              setBusy("re");
              try {
                const r = await api<{ queued: number }>("/api/reanalyze-all", { method: "POST", body: {} });
                toast(`${r.queued} advertenties in de analysewachtrij gezet`);
              } catch (e) {
                toast((e as Error).message, "err");
              } finally {
                setBusy(null);
              }
            }}
          >
            Alle advertenties opnieuw analyseren
          </Button>
          <p className="text-xs text-muted">Na wijzigen van winstdoelen of kosten: opslaan en daarna opnieuw analyseren.</p>
        </div>
      )}
    </div>
  );
}
