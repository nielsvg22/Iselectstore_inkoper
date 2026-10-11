"use client";
import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** Eén tik: profiel dat elke nieuwe iPhone meldt. */
export function IphoneMelder({ exists, isAdmin }: { exists: boolean; isAdmin: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ created: boolean }>("/api/profiles/iphone-melder", { body: {} });
      toast(r.created ? "iPhone-melder aangemaakt en snelle modus aangezet" : "iPhone-melder bijgewerkt");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4 rounded-[24px] bg-navy p-6 text-white sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10"><Smartphone className="h-6 w-6 text-accent" /></span>
        <div>
          <h2 className="text-[18px] font-semibold">Elke nieuwe iPhone melden</h2>
          <p className="mt-1 max-w-xl text-sm text-white/75">Eén tik: de app volgt alle iPhone-modellen en opslagformaten via de smalle Marktplaats-lijsten en stuurt bij elke nieuwe advertentie direct een push. iPhone 13 en nieuwer worden het vaakst bekeken. Hoe vaak precies zie je op <a href="/performance" className="font-medium underline">Prestaties</a>.</p>
        </div>
      </div>
      <Button size="lg" onClick={go} loading={busy} disabled={!isAdmin} className="shrink-0">{exists ? "Bijwerken" : "Aanzetten"}</Button>
    </div>
  );
}
