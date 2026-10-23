"use client";
import { BellRing, Check, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import type { NotifyPrefs } from "@/lib/notify/prefs";
import { currentSubscription, deliveryHint, endpointId, friendlyPushError, platformOf, pushSupport, sameKey, urlBase64ToUint8Array, type PushSupport } from "@/lib/pwa-client";
import { timeAgo } from "@/lib/format";

interface Device { id: string; endpointId: string; label: string; enabled: boolean; failures: number; lastSuccessAt: string | null; lastError: string | null; lastShownAt: string | null; lastShowError: string | null }

export function PushSettings({ initialPrefs, profiles }: { initialPrefs: NotifyPrefs; profiles: Array<{ id: string; name: string }> }) {
  const toast = useToast();
  const [support, setSupport] = React.useState<PushSupport>("unsupported");
  const [here, setHere] = React.useState<string | null>(null); // endpoint van dit apparaat
  const [hereId, setHereId] = React.useState<string | null>(null); // vingerafdruk van dit apparaat
  const healed = React.useRef(false);
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [prefs, setPrefs] = React.useState<NotifyPrefs>(initialPrefs);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const platform = React.useMemo(() => platformOf(typeof navigator === "undefined" ? "" : navigator.userAgent), []);

  const refresh = React.useCallback(async () => {
    setSupport(pushSupport());
    try {
      let sub = await currentSubscription();
      let list = (await api<{ devices: Device[] }>("/api/push/devices")).devices;
      // Zelfherstel (één keer per paginabezoek): oud abonnement met andere sleutel, of apparaat dat op de server ontbreekt of na fouten is uitgezet
      if (sub && !healed.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
        healed.current = true;
        let fixed = false;
        const { publicKey } = await api<{ publicKey: string }>("/api/push/vapid");
        if (!sameKey(sub as unknown as Parameters<typeof sameKey>[0], publicKey)) {
          const reg = await navigator.serviceWorker.getRegistration("/");
          await sub.unsubscribe();
          sub = (await reg?.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })) ?? null;
          fixed = true;
        }
        if (sub) {
          const id = await endpointId(sub.endpoint);
          const dev = list.find((d) => d.endpointId === id);
          if (fixed || !dev || (!dev.enabled && dev.failures > 0)) {
            await api("/api/push/subscribe", { body: { endpoint: sub.endpoint, keys: sub.toJSON().keys } });
            list = (await api<{ devices: Device[] }>("/api/push/devices")).devices;
            toast("Dit apparaat is opnieuw verbonden voor pushmeldingen");
          }
        }
      }
      setHere(sub?.endpoint ?? null);
      setHereId(sub ? await endpointId(sub.endpoint) : null);
      setDevices(list);
    } catch {
      /* negeren */
    }
  }, [toast]);
  React.useEffect(() => { void refresh(); }, [refresh]);

  const enable = async () => {
    setBusy("enable");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Toestemming voor meldingen is niet gegeven. Pas dit aan in de instellingen van je toestel of browser.");
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string }>("/api/push/vapid");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const j = sub.toJSON();
      await api("/api/push/subscribe", { body: { endpoint: sub.endpoint, keys: j.keys } });
      toast("Pushmeldingen ingeschakeld op dit apparaat");
      setHint(deliveryHint(platform));
      await refresh();
    } catch (e) {
      toast(friendlyPushError(e, platform), "err");
    } finally {
      setBusy(null);
    }
  };

  const disableHere = async () => {
    setBusy("disable");
    try {
      const sub = await currentSubscription();
      if (sub) {
        await api("/api/push/unsubscribe", { body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      toast("Pushmeldingen uitgeschakeld op dit apparaat");
      await refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const r = await api<{ sent: number; failed: number; removed: number }>("/api/push/test", { body: {} });
      toast(r.sent ? `Testpush verstuurd naar ${r.sent} apparaat${r.sent > 1 ? "en" : ""}${r.failed ? ` — mislukt op ${r.failed}: zie de fout bij dat apparaat hieronder` : ""}` : "Testpush mislukte op alle apparaten: zie de fout bij elk apparaat hieronder", r.sent && !r.failed ? "ok" : "err");
      setHint(deliveryHint(platform));
      await refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("prefs");
    try {
      setPrefs((await api<{ prefs: NotifyPrefs }>("/api/notify/prefs", { method: "PUT", body: prefs })).prefs);
      toast("Meldingsvoorkeuren opgeslagen");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  const toggleProfile = (id: string) => setPrefs((p) => ({ ...p, profileIds: p.profileIds.includes(id) ? p.profileIds.filter((x) => x !== id) : [...p.profileIds, id] }));

  return (
    <Card id="push">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><BellRing className="h-4 w-4 text-accent" />Pushmeldingen</CardTitle>
          <CardDescription>Ontvang direct een melding op je telefoon of computer zodra een nieuwe advertentie aan je zoekvoorwaarden voldoet — ook als de app gesloten is.</CardDescription>
        </div>
        <Link href="/install" className="text-[13px] font-medium text-accent-strong hover:underline">Installatiehandleiding</Link>
      </CardHeader>
      <CardContent className="space-y-6">
        {support === "needs-install" && <Notice tone="warning">Op iPhone/iPad werken pushmeldingen alleen als je de app eerst op je beginscherm zet (Safari → Deel-knop → “Zet op beginscherm”) en hem daar opent. <Link href="/install" className="font-semibold underline">Zie de handleiding</Link>.</Notice>}
        {support === "unsupported" && <Notice tone="warning">Deze browser ondersteunt geen Web Push. Gebruik Chrome, Edge, Firefox of Safari (iOS 16.4+ als geïnstalleerde app), of kies Telegram als alternatief.</Notice>}
        {support === "denied" && <Notice tone="danger">Meldingen zijn voor deze site geblokkeerd. {platform.browser === "safari" ? "Safari → Instellingen → Websites → Meldingen: zet deze site op Toestaan." : "Klik op het slotje links in de adresbalk → Meldingen → Toestaan."} Herlaad daarna de pagina.</Notice>}
        {hint && <Notice tone="warning">{hint}</Notice>}

        <div className="flex flex-wrap items-center gap-3">
          {support === "ready" && !here && <Button onClick={enable} loading={busy === "enable"}><BellRing className="h-4 w-4" />Pushmeldingen inschakelen</Button>}
          {here && <Button variant="outline" onClick={disableHere} loading={busy === "disable"}>Uitschakelen op dit apparaat</Button>}
          {devices.some((d) => d.enabled) && <Button variant="secondary" onClick={test} loading={busy === "test"}>Stuur testpush</Button>}
          {here && <Badge tone="success"><Check className="mr-1 h-3 w-3" />Dit apparaat is aangemeld</Badge>}
        </div>

        {devices.length > 0 && (
          <ul className="divide-y divide-card-border rounded-2xl border border-card-border" aria-label="Aangemelde apparaten">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Smartphone className="h-4 w-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{d.label || "Apparaat"}{d.endpointId === hereId && <Badge tone="accent">Dit apparaat</Badge>}{!d.enabled && d.failures > 0 && <Badge tone="danger">Uitgeschakeld na fouten</Badge>}</p>
                  {d.lastShowError ? <p className="text-xs text-danger">De browser kon de melding niet tonen: {d.lastShowError}. Controleer of meldingen voor deze site zijn toegestaan.</p> : d.lastSuccessAt && d.lastShownAt ? <p className="text-xs text-muted">Laatst getoond door de browser {timeAgo(d.lastShownAt)}. Zie je niets? Dan blokkeert Windows of macOS de melding (Focus/Niet storen, of meldingen voor de browser uit).</p> : d.lastSuccessAt ? <p className="text-xs text-warning">Bezorgd bij de pushdienst, maar de browser heeft nog niet teruggemeld dat hij de melding toonde. Open de browser en probeer opnieuw.</p> : null}
                  <p className="truncate text-xs text-muted">{d.lastError ? `Laatste fout (${d.failures}×): ${d.lastError}` : d.lastSuccessAt ? `Laatst bezorgd ${timeAgo(d.lastSuccessAt)}` : "Nog niets verstuurd"}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={d.enabled} onChange={async (e) => { await api(`/api/push/devices/${d.id}`, { method: "PATCH", body: { enabled: e.target.checked } }); await refresh(); }} />Aan</label>
                <button type="button" aria-label={`Apparaat ${d.label} verwijderen`} className="rounded-lg p-2 text-muted hover:bg-muted-bg hover:text-danger" onClick={async () => { await api(`/api/push/devices/${d.id}`, { method: "DELETE" }); await refresh(); }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-4 border-t border-card-border pt-6">
          <p className="text-sm font-semibold">Welke deals melden?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Welke deals" htmlFor="np-mode">
              <Select id="np-mode" value={prefs.mode} onChange={(e) => setPrefs({ ...prefs, mode: e.target.value as NotifyPrefs["mode"] })}>
                <option value="all">Alle passende deals</option>
                <option value="top">Alleen topdeals</option>
              </Select>
            </Field>
            <Field label="Alleen melden vanaf winst (€)" htmlFor="np-profit" hint="Leeg = geen ondergrens">
              <Input id="np-profit" type="number" min="0" value={prefs.minProfitEuro ?? ""} onChange={(e) => setPrefs({ ...prefs, minProfitEuro: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Alleen melden vanaf dealscore" htmlFor="np-score" hint="Leeg = de drempel van het zoekprofiel">
              <Input id="np-score" type="number" min="0" max="100" value={prefs.minScore ?? ""} onChange={(e) => setPrefs({ ...prefs, minScore: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Telegram" htmlFor="np-tg" hint="Telegram kan ook als alternatief dienen wanneer geen pushapparaat actief is">
              <Select id="np-tg" value={prefs.telegram} onChange={(e) => setPrefs({ ...prefs, telegram: e.target.value as NotifyPrefs["telegram"] })}>
                <option value="profile">Zoals per zoekprofiel ingesteld</option>
                <option value="fallback">Alleen als alternatief (geen pushapparaat)</option>
                <option value="off">Uit</option>
              </Select>
            </Field>
          </div>
          {profiles.length > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-foreground/80">Alleen geselecteerde zoekprofielen <span className="font-normal text-muted">(niets aangevinkt = alle)</span></legend>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={prefs.profileIds.includes(p.id)} onChange={() => toggleProfile(p.id)} />{p.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:pb-3"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={prefs.quiet.enabled} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, enabled: e.target.checked } })} />Stilteperiode</label>
            <Field label="Van" htmlFor="np-qs"><Input id="np-qs" type="time" disabled={!prefs.quiet.enabled} value={prefs.quiet.start} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, start: e.target.value } })} /></Field>
            <Field label="Tot" htmlFor="np-qe"><Input id="np-qe" type="time" disabled={!prefs.quiet.enabled} value={prefs.quiet.end} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, end: e.target.value } })} /></Field>
          </div>
          <p className="text-xs text-muted">Meldingen die in de stilteperiode vallen worden niet weggegooid maar verstuurd zodra de stilte eindigt (tijdzone Europe/Amsterdam).</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={prefs.popup} onChange={(e) => setPrefs({ ...prefs, popup: e.target.checked })} />Pop-up in de app bij elke nieuwe advertentie (zolang de app open staat)</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={prefs.push} onChange={(e) => setPrefs({ ...prefs, push: e.target.checked })} />Pushmeldingen actief voor mijn account (alle apparaten)</label>
          <Button onClick={save} loading={busy === "prefs"}>Voorkeuren opslaan</Button>
        </div>
      </CardContent>
    </Card>
  );
}
