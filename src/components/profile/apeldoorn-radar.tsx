"use client";
import { Radar, RefreshCcw } from "lucide-react";
import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";

export function ApeldoornRadarSetup({ active, profileCount, isAdmin }: { active: boolean; profileCount: number; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const install = async () => {
    const message = profileCount
      ? `Vervang ${profileCount} bestaande zoekprofiel(en) door de Apeldoorn-radar? De huidige zoekprofielen worden eerst als back-up opgeslagen. Advertenties en inkopen blijven bewaard.`
      : "Maak de inkoopradar voor Apeldoorn aan?";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const r = await api<{ removed: number }>("/api/profiles/apeldoorn-radar", { body: {} });
      toast(`Inkoopradar actief · ${r.removed} oude profielen veilig vervangen`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-4 rounded-[24px] border border-card-border bg-card p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Radar className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <h2 className="text-lg font-semibold">Apeldoorn · 40 km</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Eén helder inkoopprofiel. Verder weg? Alleen verzendbare advertenties van aantoonbaar goed beoordeelde, langer actieve verkopers.
            Afstand of reviews onbekend betekent niet automatisch goedgekeurd.
          </p>
          <p className="mt-2 text-xs text-muted">
            Streeft naar een controle per minuut met een permanente worker en toegestane databron; geen gegarandeerde plaatsing-tot-push-tijd.
          </p>
        </div>
      </div>
      {isAdmin && (
        <Button type="button" variant={active ? "outline" : "primary"} onClick={install} loading={busy} className="shrink-0">
          <RefreshCcw className="h-4 w-4" />{active ? "Radar opnieuw instellen" : "Gebruik dit profiel"}
        </Button>
      )}
    </section>
  );
}
