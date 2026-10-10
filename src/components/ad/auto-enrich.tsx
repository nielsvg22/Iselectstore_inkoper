"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { api } from "@/lib/client-api";

/**
 * Zoekresultaten bevatten maar 1–3 foto's en een afgekapte tekst. Bij het openen van zo'n advertentie
 * halen we automatisch (één keer) de volledige detailpagina op en vernieuwen we de weergave.
 */
export function AutoEnrich({ adId }: { adId: string }) {
  const router = useRouter();
  const started = React.useRef(false);
  const [state, setState] = React.useState<"busy" | "error">("busy");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ ok: boolean; error?: string }>(`/api/ads/${adId}/refresh`, { method: "POST", body: {} })
      .then((r) => {
        if (r.ok) router.refresh();
        else {
          setState("error");
          setMsg(r.error ?? "Detailpagina niet beschikbaar");
        }
      })
      .catch((e: Error) => {
        setState("error");
        setMsg(e.message);
      });
  }, [adId, router]);
  if (state === "error") return <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm">Alle foto’s en de volledige tekst konden niet worden opgehaald: {msg}. De advertentie is mogelijk verkocht of verwijderd.</p>;
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm" role="status">
      <Loader2 className="h-4 w-4 animate-spin text-accent" />Alle foto’s en de volledige tekst worden opgehaald…
    </p>
  );
}
