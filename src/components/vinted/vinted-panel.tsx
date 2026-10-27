"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import type { VintedState } from "@/components/rules/general-filters-editor";
import { api } from "@/lib/client-api";

export function VintedPanel({ initial, isAdmin }: { initial: VintedState; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = React.useState(initial);
  const [queries, setQueries] = React.useState((initial.profile?.queries ?? ["iphone"]).join(", "));
  const [busy, setBusy] = React.useState(false);
  const apply = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const r = await api<{ status: VintedState }>("/api/profiles/vinted", { body });
      setV(r.status);
      toast(msg);
      router.refresh();
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  const ago = (iso: string | null) => (iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))} s geleden` : "nog niet");
  return (
    <div className="space-y-4">
      {v.cooldown && <Notice tone="warning">Vinted is gepauzeerd tot {new Date(v.cooldown.until).toLocaleTimeString("nl-NL")}: {v.cooldown.reason}. De app probeert dit niet te omzeilen.</Notice>}
      {v.profile?.lastError && !v.cooldown && <Notice tone="danger">Laatste fout: {v.profile.lastError}</Notice>}
      {!v.settings.enabled && <Notice tone="info">Vinted staat uit. Zet het aan en maak het zoekprofiel aan; dan zoekt de app elke {v.settings.intervalSeconds} seconden naar de nieuwste advertenties in heel Nederland.</Notice>}
      <div className="flex flex-wrap items-center gap-6">
        <Switch checked={v.settings.enabled} onChange={(on) => apply({ enabled: on }, on ? "Vinted aangezet" : "Vinted uitgezet")} label="Vinted aan" disabled={!isAdmin || busy} />
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <div><dt className="inline">Laatste controle: </dt><dd className="inline font-medium text-foreground">{ago(v.profile?.lastCheckedAt ?? null)}</dd></div>
          <div><dt className="inline">Laatste geslaagd: </dt><dd className="inline font-medium text-foreground">{ago(v.profile?.lastSuccessAt ?? null)}</dd></div>
          <div><dt className="inline">Opgeslagen advertenties: </dt><dd className="inline font-medium text-foreground">{v.adCount}</dd></div>
          <div><dt className="inline">Requests vandaag: </dt><dd className="inline font-medium text-foreground">{v.health?.requestsToday ?? 0}</dd></div>
        </dl>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1"><span className="mb-1.5 block text-[13px] font-medium text-foreground/80">Zoektermen (komma, nieuwste eerst)</span>
            <Input aria-label="Vinted-zoektermen" value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="iphone, ipad, macbook" /></label>
          <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-foreground/80">Elke (seconden)</span>
            <Input aria-label="Interval in seconden" type="number" min={30} className="w-28" value={v.settings.intervalSeconds} onChange={(e) => setV({ ...v, settings: { ...v.settings, intervalSeconds: Number(e.target.value) } })} /></label>
          <Button loading={busy} onClick={() => apply({ enabled: true, intervalSeconds: v.settings.intervalSeconds, queries: queries.split(/[,\n]/).map((q) => q.trim()).filter((q) => q.length >= 2) }, "Vinted-radar bijgewerkt")}>{v.profile ? "Zoekprofiel bijwerken" : "Zoekprofiel aanmaken en aanzetten"}</Button>
        </div>
      )}
    </div>
  );
}
