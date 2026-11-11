"use client";
import * as React from "react";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client-api";

type Preset = "rustig" | "normaal" | "druk";
interface Knob { presets: { marktplaats: Preset; vinted: Preset }; auto: boolean; offsetsEuro: Record<Preset, number> }
const LABEL: Record<Preset, string> = { rustig: "Rustig", normaal: "Normaal", druk: "Druk" };
const sign = (n: number) => (n > 0 ? `+€${n}` : n < 0 ? `−€${Math.abs(n)}` : "±€0");

/** Dynamische margeknop: per platform Rustig / Normaal / Druk, of automatisch op basis van het aanbod. Werkt direct door. */
export function MarginKnob({ initial, isAdmin }: { initial: Knob; isAdmin: boolean }) {
  const [k, setK] = React.useState<Knob>(initial);
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  async function send(patch: Partial<{ marktplaats: Preset; vinted: Preset; auto: boolean }>) {
    setBusy(true);
    try {
      setK(await api<Knob>("/api/rules/margin-knob", { body: patch }));
      toast("Margeknop aangepast, werkt direct door");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", "err");
    } finally {
      setBusy(false);
    }
  }
  const Row = ({ platform, name }: { platform: "marktplaats" | "vinted"; name: string }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-sm font-medium">{name}</span>
      <div role="group" aria-label={`Margestand ${name}`} className="inline-flex overflow-hidden rounded-full border border-card-border">
        {(["rustig", "normaal", "druk"] as Preset[]).map((p) => (
          <button key={p} type="button" disabled={!isAdmin || busy || k.auto} aria-pressed={k.presets[platform] === p} onClick={() => send({ [platform]: p })}
            className={`px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${k.presets[platform] === p ? "bg-foreground text-background" : "hover:bg-muted-bg"}`}>
            {LABEL[p]} <span className="text-xs opacity-70">{sign(k.offsetsEuro[p])}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-card-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Margeknop</h2>
          <p className="text-xs text-muted">Rustig = lagere eis aan de marge, Druk = hogere (bijv. na een lancering). Het bedrag wordt bij de vereiste marge opgeteld.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={k.auto} disabled={!isAdmin || busy} onChange={(e) => send({ auto: e.target.checked })} />
          Automatisch op basis van aanbod
        </label>
      </div>
      <Row platform="marktplaats" name="Marktplaats" />
      <Row platform="vinted" name="Vinted" />
      {k.auto && <p className="text-xs text-muted">Automatisch: het aantal nieuwe advertenties in het laatste uur bepaalt de stand. Zet het uit om zelf te kiezen.</p>}
    </div>
  );
}
