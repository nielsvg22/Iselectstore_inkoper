"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";

export function MNumbersForm() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ registered: Array<{ created: boolean }> }>("/api/funnel/mnumbers", { body: { text } });
      toast(r.registered.length ? `${r.registered.filter((x) => x.created).length} nieuw, ${r.registered.filter((x) => !x.created).length} al bekend` : "Geen M-nummers gevonden in de tekst", r.registered.length ? "ok" : "err");
      setText("");
      router.refresh();
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Field label="Gekochte advertenties (M-nummers)" hint="Plak de nummers of de doorgestuurde berichten, bijv. m2158666552. Ze komen in de funnel en bij Mijn inkopen."><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="m2158666552 m2158666553" /></Field>
      <Button onClick={submit} loading={busy} disabled={!text.trim()}>Registreren als gekocht</Button>
    </div>
  );
}
