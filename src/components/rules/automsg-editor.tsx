"use client";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import type { RulesConfig } from "@/lib/rules/config";

export interface AutoMsgRow { id: string; adId: string | null; at: string; text: string; title: string; url: string; sellerId: string; sellerName: string | null; template: number }

export function AutoMsgEditor({ initialRules, messages, isAdmin }: { initialRules: RulesConfig; messages: AutoMsgRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = React.useState(initialRules.autoMessage);
  const [ids, setIds] = React.useState(initialRules.autoMessage.sellerIds.join("\n"));
  const [tpls, setTpls] = React.useState(initialRules.autoMessage.templates.join("\n\n---\n\n"));
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const next = { ...c, sellerIds: ids.split(/[\s,;]+/).filter(Boolean), templates: tpls.split(/\n\s*---\s*\n/).map((t) => t.trim()).filter(Boolean) };
      const cur = await api<{ rules: RulesConfig }>("/api/rules");
      await api("/api/rules", { method: "PUT", body: { ...cur.rules, autoMessage: next } });
      toast("Auto-berichten opgeslagen");
      router.refresh();
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Notice tone="warning">Er wordt <strong>niets automatisch naar Marktplaats verstuurd</strong>. Bij een advertentie van een ingestelde verkoper wordt het bericht klaargezet in het logboek (en per Telegram), zodat je het zelf kunt plakken en versturen.</Notice>
      <Card>
        <CardHeader><div><CardTitle>Instellingen</CardTitle><CardDescription>Het bericht gaat alleen over advertenties van de verkoper-ID&apos;s hieronder. Eén keer per advertentie; de sjablonen wisselen om en om.</CardDescription></div>{isAdmin && <Button onClick={save} loading={busy}><Save className="h-4 w-4" />Opslaan</Button>}</CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <Switch checked={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label="Auto-berichten aan" disabled={!isAdmin} />
            <Switch checked={c.requireMatch} onChange={(v) => setC({ ...c, requireMatch: v })} label="Alleen als de inkoopregels de advertentie goedkeuren" disabled={!isAdmin} />
            <Switch checked={c.notifyTelegram} onChange={(v) => setC({ ...c, notifyTelegram: v })} label="Ook per Telegram melden" disabled={!isAdmin} />
          </div>
          <label className="block"><span className="mb-1.5 block text-[13px] font-medium">Marktplaats-verkoper-ID&apos;s (één per regel)</span>
            <Textarea aria-label="Verkoper-ID's" rows={3} value={ids} disabled={!isAdmin} onChange={(e) => setIds(e.target.value)} placeholder="26607609" />
            <span className="mt-1 block text-xs text-muted">Leeg = voor niemand. Zet &quot;alleen als de regels goedkeuren&quot; uit om bij elke advertentie van deze verkoper te testen.</span></label>
          <label className="block"><span className="mb-1.5 block text-[13px] font-medium">Sjablonen (scheid met een regel met ---; {"{naam}"} wordt de voornaam van de verkoper)</span>
            <Textarea aria-label="Sjablonen" rows={14} value={tpls} disabled={!isAdmin} onChange={(e) => setTpls(e.target.value)} /></label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Logboek ({messages.length})</CardTitle><CardDescription>Klaargezette berichten, nieuwste eerst. Niets hiervan is verstuurd.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 && <p className="text-sm text-muted">Nog niets klaargezet.</p>}
          {messages.map((m) => (
            <div key={m.id} className="rounded-2xl border border-card-border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>{new Date(m.at).toLocaleString("nl-NL")} · verkoper {m.sellerId}{m.sellerName ? ` (${m.sellerName})` : ""} · sjabloon {m.template + 1}</span>{m.adId && <a className="underline" href={`/ads/${m.adId}`}>Advertentie</a>}</div>
              <p className="mt-1 font-medium">{m.title}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-foreground/80">{m.text}</pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
