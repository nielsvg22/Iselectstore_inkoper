"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
export function RadarBackups() {
  const [backups, setBackups] = useState<
    Array<{ key: string; value: unknown }>
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <details
      className="rounded-2xl border border-card-border p-5"
      onToggle={async (e) => {
        if (e.currentTarget.open) {
          try {
            setBackups(await api("/api/profiles/apeldoorn-radar"));
          } catch {
            setError("Back-ups laden mislukt");
          }
        }
      }}
    >
      <summary className="cursor-pointer text-sm font-medium">
        Profielback-ups en herstel
      </summary>
      <p className="mt-3 text-xs text-muted">
        Herstel activeert de oorspronkelijke profielen en pauzeert de radar.
        Advertenties en historie blijven gekoppeld.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {backups.map((b) => (
        <div
          key={b.key}
          className="mt-4 flex flex-wrap items-center gap-4 text-sm"
        >
          <span>
            {new Date(Number(b.key.split(":").at(-1))).toLocaleString("nl-NL")}
          </span>
          <button
            className="underline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(b.value, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "iselect-profielen-backup.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download JSON
          </button>
          <button
            disabled={busy}
            className="underline disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/profiles/apeldoorn-radar", {
                  method: "PATCH",
                  body: { backupKey: b.key },
                });
                router.refresh();
              } catch {
                setError("Herstellen mislukt");
              } finally {
                setBusy(false);
              }
            }}
          >
            Herstel profielen
          </button>
        </div>
      ))}
      {!backups.length && (
        <p className="mt-3 text-xs text-muted">Nog geen back-ups.</p>
      )}
    </details>
  );
}
