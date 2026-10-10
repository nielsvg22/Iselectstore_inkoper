"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

export function RunNow() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ scheduled: number; processed: number; failed: number }>("/api/jobs/tick", { method: "POST", body: {} });
          toast(`${r.scheduled} controle(s) gepland, ${r.processed} job(s) verwerkt, ${r.failed} mislukt`, r.failed ? "err" : "ok");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "err");
        } finally {
          setBusy(false);
        }
      }}
    >
      <RefreshCw className="h-4 w-4" />Nu verwerken
    </Button>
  );
}
