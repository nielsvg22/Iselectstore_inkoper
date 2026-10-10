"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { eurosToCents } from "@/lib/format";

export function AddComparable() {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = React.useState({ modelKey: "", storageGb: "", price: "", kind: "REALIZED", battery: "", date: new Date().toISOString().slice(0, 10) });
  const [bulk, setBulk] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void wrap(async () => {
            await api("/api/market/comparables", { body: { modelKey: f.modelKey.trim().toLowerCase(), storageGb: f.storageGb ? Number(f.storageGb) : null, priceCents: eurosToCents(f.price), kind: f.kind, batteryHealth: f.battery ? Number(f.battery) : null, observedAt: new Date(f.date).toISOString() } });
            setF({ ...f, price: "" });
          }, "Prijs toegevoegd");
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Model-sleutel" htmlFor="m-key" hint="bijv. iphone-15-pro"><Input id="m-key" required pattern="[a-z0-9]+(-[a-z0-9_]+)*" placeholder="iphone-15-pro" value={f.modelKey} onChange={(e) => setF({ ...f, modelKey: e.target.value })} /></Field>
          <Field label="Opslag (GB)" htmlFor="m-gb"><Input id="m-gb" type="number" min="0" value={f.storageGb} onChange={(e) => setF({ ...f, storageGb: e.target.value })} /></Field>
          <Field label="Prijs (€)" htmlFor="m-pr"><Input id="m-pr" type="number" min="1" required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Soort" htmlFor="m-kind"><Select id="m-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="REALIZED">Gerealiseerde verkoopprijs</option><option value="ASKING_CURRENT">Actuele vraagprijs</option><option value="ASKING_HISTORIC">Historische vraagprijs</option></Select></Field>
          <Field label="Batterij (%)" htmlFor="m-bat"><Input id="m-bat" type="number" min="40" max="100" value={f.battery} onChange={(e) => setF({ ...f, battery: e.target.value })} /></Field>
          <Field label="Datum" htmlFor="m-date"><Input id="m-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Button type="submit" loading={busy}>Toevoegen</Button>
      </form>
      <div className="border-t border-card-border pt-5">
        <Field label="Bulk toevoegen (één per regel)" htmlFor="m-bulk" hint="Formaat: model-sleutel; opslag; prijs; soort (REALIZED of ASKING_CURRENT). Bijv. iphone-15-pro; 256; 640; REALIZED">
          <Textarea id="m-bulk" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"iphone-15-pro; 256; 640; REALIZED\niphone-14; 128; 410; ASKING_CURRENT"} />
        </Field>
        <Button
          variant="secondary"
          className="mt-3"
          loading={busy}
          disabled={!bulk.trim()}
          onClick={() =>
            wrap(async () => {
              const items = bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
                const [m, gb, p, k] = l.split(";").map((x) => x.trim());
                const kind = (k || "REALIZED").toUpperCase();
                if (!["REALIZED", "ASKING_CURRENT", "ASKING_HISTORIC"].includes(kind)) throw new Error(`Regel ${i + 1}: onbekend soort ‘${k}’`);
                const price = Number((p ?? "").replace(",", "."));
                if (!m || !price) throw new Error(`Regel ${i + 1}: model en prijs zijn verplicht`);
                return { modelKey: m.toLowerCase(), storageGb: gb ? Number(gb) : null, priceCents: Math.round(price * 100), kind };
              });
              await api("/api/market/comparables", { body: { items } });
              setBulk("");
            }, "Prijzen toegevoegd")
          }
        >
          Bulk toevoegen
        </Button>
      </div>
    </div>
  );
}

export function DeleteComparable({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Verwijder prijs"
      onClick={async () => {
        try {
          await api(`/api/market/comparables/${id}`, { method: "DELETE" });
          toast("Verwijderd");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "err");
        }
      }}
    >
      <Trash2 className="h-3.5 w-3.5 text-danger" />
    </Button>
  );
}
