"use client";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

export function ProfileActions({ id, active, runnable }: { id: string; active: boolean; runnable: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  async function toggle() {
    setBusy("toggle");
    try {
      const { profile, tree } = await api<{ profile: Record<string, unknown>; tree: unknown }>(`/api/profiles/${id}`);
      const p = profile as { name: string; query: string; sourceKind: string; sourceConfig: unknown; intervalMinutes: number; notifyEnabled: boolean; notifyChannels: string[]; notifyMinScore: number; prioritizeNew: boolean };
      await api(`/api/profiles/${id}`, { method: "PUT", body: { name: p.name, query: p.query, sourceKind: p.sourceKind, sourceConfig: p.sourceConfig, intervalMinutes: p.intervalMinutes, notifyEnabled: p.notifyEnabled, notifyChannels: p.notifyChannels, notifyMinScore: p.notifyMinScore, prioritizeNew: p.prioritizeNew, active: !active, tree } });
      toast(active ? "Profiel gepauzeerd" : "Profiel geactiveerd");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {runnable && (
        <Button
          size="sm"
          loading={busy === "run"}
          onClick={async () => {
            setBusy("run");
            try {
              const r = await api<{ ok: boolean; error?: string; fetched?: number; created?: number; analyzed?: number }>(`/api/profiles/${id}/run`, { method: "POST", body: {} });
              if (r.ok) toast(`${r.fetched} advertentie(s) opgehaald, ${r.created} nieuw, ${r.analyzed} geanalyseerd`);
              else toast(r.error ?? "Controle mislukt", "err");
              router.refresh();
            } catch (e) {
              toast((e as Error).message, "err");
            } finally {
              setBusy(null);
            }
          }}
        >
          <Play className="h-3.5 w-3.5" />Nu controleren
        </Button>
      )}
      <Link href={`/profiles/${id}`}><Button size="sm" variant="secondary"><Pencil className="h-3.5 w-3.5" />Bewerken</Button></Link>
      <Button size="sm" variant="outline" loading={busy === "toggle"} onClick={toggle}>{active ? <><Pause className="h-3.5 w-3.5" />Pauzeren</> : <><Play className="h-3.5 w-3.5" />Activeren</>}</Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Verwijderen"
        onClick={async () => {
          if (!confirm("Dit zoekprofiel verwijderen? Gevonden advertenties blijven bewaard.")) return;
          try {
            await api(`/api/profiles/${id}`, { method: "DELETE" });
            toast("Zoekprofiel verwijderd");
            router.refresh();
          } catch (e) {
            toast((e as Error).message, "err");
          }
        }}
      >
        <Trash2 className="h-3.5 w-3.5 text-danger" />
      </Button>
    </div>
  );
}
