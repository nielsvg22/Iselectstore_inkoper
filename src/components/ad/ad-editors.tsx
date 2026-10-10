"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { eurosToCents } from "@/lib/format";

type Costs = { repairCents?: number; shippingCents?: number; transportCents?: number; otherCents?: number; marginSchemeEligible?: boolean };
const e = (c?: number) => (c == null ? "" : String(c / 100));

export function CostEditor({ adId, overrides, defaults }: { adId: string; overrides: Costs; defaults: { repair: number; shipping: number; transport: number; other: number; marginSchemeEligible: boolean; vatMode: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = React.useState({ repair: e(overrides.repairCents), shipping: e(overrides.shippingCents), transport: e(overrides.transportCents), other: e(overrides.otherCents) });
  const [margin, setMargin] = React.useState(overrides.marginSchemeEligible ?? defaults.marginSchemeEligible);
  const [busy, setBusy] = React.useState(false);
  const field = (k: keyof typeof v, label: string, ph: number) => (
    <Field label={`${label} (€)`} htmlFor={`c-${k}`}>
      <Input id={`c-${k}`} type="number" min="0" step="1" placeholder={`standaard ${ph / 100}`} value={v[k]} onChange={(ev) => setV({ ...v, [k]: ev.target.value })} />
    </Field>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        try {
          const costs: Costs = { marginSchemeEligible: margin };
          if (v.repair !== "") costs.repairCents = eurosToCents(v.repair);
          if (v.shipping !== "") costs.shippingCents = eurosToCents(v.shipping);
          if (v.transport !== "") costs.transportCents = eurosToCents(v.transport);
          if (v.other !== "") costs.otherCents = eurosToCents(v.other);
          await api(`/api/ads/${adId}`, { method: "PATCH", body: { overrides: { costs } } });
          await api(`/api/ads/${adId}/reanalyze`, { method: "POST", body: {} });
          toast("Kosten opgeslagen en analyse herberekend");
          router.refresh();
        } catch (err) {
          toast((err as Error).message, "err");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field("repair", "Reparatiekosten", defaults.repair)}
        {field("shipping", "Verzendkosten", defaults.shipping)}
        {field("transport", "Transportkosten", defaults.transport)}
        {field("other", "Overige kosten", defaults.other)}
      </div>
      {defaults.vatMode === "margin" && (
        <Switch checked={margin} onChange={setMargin} label="Margeregeling is van toepassing op deze transactie" />
      )}
      <Button type="submit" loading={busy}>Opslaan &amp; herberekenen</Button>
    </form>
  );
}

export function CorrectionsForm({ adId, current }: { adId: string; current: { modelKey: string; storageGb?: number | null; ramGb?: number | null; batteryHealth?: number | null; color?: string | null; condition?: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = React.useState({ modelKey: current.modelKey, storageGb: current.storageGb != null ? String(current.storageGb) : "", ramGb: current.ramGb != null ? String(current.ramGb) : "", batteryHealth: current.batteryHealth != null ? String(current.batteryHealth) : "", color: current.color ?? "" });
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        try {
          const facts: Record<string, string | number> = {};
          if (v.storageGb) facts.storageGb = Number(v.storageGb);
          if (v.ramGb) facts.ramGb = Number(v.ramGb);
          if (v.batteryHealth) facts.batteryHealth = Number(v.batteryHealth);
          if (v.color) facts.color = v.color;
          const recognition: Record<string, unknown> = { facts };
          if (v.modelKey && v.modelKey !== current.modelKey) recognition.modelKey = v.modelKey.trim().toLowerCase();
          await api(`/api/ads/${adId}`, { method: "PATCH", body: { overrides: { recognition } } });
          await api(`/api/ads/${adId}/reanalyze`, { method: "POST", body: {} });
          toast("Correcties opgeslagen; analyse herberekend");
          router.refresh();
        } catch (err) {
          toast((err as Error).message, "err");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model-sleutel" htmlFor="x-model" hint="bijv. iphone-15-pro, macbook-air-m2-13"><Input id="x-model" value={v.modelKey} pattern="[a-z0-9]+(-[a-z0-9_]+)*" onChange={(ev) => setV({ ...v, modelKey: ev.target.value })} /></Field>
        <Field label="Kleur" htmlFor="x-color"><Input id="x-color" value={v.color} onChange={(ev) => setV({ ...v, color: ev.target.value })} /></Field>
        <Field label="Opslag (GB)" htmlFor="x-storage"><Input id="x-storage" type="number" min="16" value={v.storageGb} onChange={(ev) => setV({ ...v, storageGb: ev.target.value })} /></Field>
        <Field label="RAM (GB)" htmlFor="x-ram"><Input id="x-ram" type="number" min="2" value={v.ramGb} onChange={(ev) => setV({ ...v, ramGb: ev.target.value })} /></Field>
        <Field label="Batterijconditie (%)" htmlFor="x-bat" hint="Alleen invullen als je het hebt gecontroleerd."><Input id="x-bat" type="number" min="40" max="100" value={v.batteryHealth} onChange={(ev) => setV({ ...v, batteryHealth: ev.target.value })} /></Field>
      </div>
      <p className="text-xs text-muted">Handmatige correcties tellen als <strong>vastgesteld</strong> en winnen van automatische herkenning.</p>
      <Button type="submit" loading={busy}>Correcties opslaan</Button>
    </form>
  );
}

export function NotesEditor({ adId, initial }: { adId: string; initial: string }) {
  const toast = useToast();
  const [v, setV] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-3">
      <Textarea aria-label="Notities" placeholder="Bijv. verkoper gebeld, afspraak donderdag…" value={v} onChange={(ev) => setV(ev.target.value)} maxLength={5000} />
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        disabled={v === initial}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/ads/${adId}`, { method: "PATCH", body: { notes: v } });
            toast("Notitie opgeslagen");
          } catch (err) {
            toast((err as Error).message, "err");
          } finally {
            setBusy(false);
          }
        }}
      >
        Notitie opslaan
      </Button>
    </div>
  );
}

export { Select };
