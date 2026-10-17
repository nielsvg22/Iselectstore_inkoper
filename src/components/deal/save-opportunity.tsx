"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
export function SaveOpportunity({ id, saved }: { id: string; saved: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div>
      <button
        disabled={busy}
        className="text-sm text-muted hover:text-foreground disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`/api/ads/${id}`, {
              method: "PATCH",
              body: { userState: saved ? "NONE" : "FAVORITE" },
            });
            router.refresh();
          } catch {
            setError("Opslaan mislukt. Probeer opnieuw.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Even wachten…" : saved ? "Opgeslagen ✓" : "Opslaan"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
