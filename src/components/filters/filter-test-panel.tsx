"use client";
import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client-api";
import { formatEuro } from "@/lib/format";
import type { Explained, Group } from "@/lib/engines/filters";

interface Item { adId: string; title: string; model: string | null; askingCents: number; netProfitCents: number; score: number; pass: boolean; reasons: string[]; explain: Explained }
interface Result { total: number; matched: number; items: Item[]; blockers: Array<{ label: string; failed: number }> }

function Tree({ e, depth = 0 }: { e: Explained; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 14 }} className="space-y-1">
      {e.kind === "group" ? (
        <>
          <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-faint">{e.pass ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}{e.label}{e.op === "OR" ? " (OF)" : ""}</p>
          {e.children?.map((c, i) => <Tree key={i} e={c} depth={depth + 1} />)}
        </>
      ) : (
        <p className="flex items-start gap-1.5 text-[13px]">{e.pass ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />}<span><span className={e.pass ? "" : "font-medium"}>{e.label}</span> <span className="text-muted">— nu: {e.actual}</span></span></p>
      )}
    </div>
  );
}

/** "Test deze filters op bestaande advertenties" + uitleg waarom een advertentie wel/niet voldoet. */
export function FilterTestPanel({ tree }: { tree: Group }) {
  const [res, setRes] = React.useState<Result | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setRes(await api<Result>("/api/filters/test", { body: { tree } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <div><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-accent" />Test deze filters op bestaande advertenties</CardTitle><CardDescription>Zie direct hoeveel van je al gevonden advertenties zouden matchen — en waarom een advertentie wel of niet voldoet.</CardDescription></div>
        <Button type="button" onClick={run} loading={busy}>Test filters</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        {res && (
          <>
            <p className="text-sm" aria-live="polite"><strong>{res.matched}</strong> van {res.total} advertenties voldoen aan deze filters.</p>
            {res.blockers.length > 0 && (
              <div className="rounded-2xl bg-muted-bg p-4">
                <p className="mb-2 text-[13px] font-medium">Meest blokkerende voorwaarden</p>
                <ul className="space-y-1 text-[13px] text-muted">{res.blockers.map((b) => <li key={b.label}>{b.failed}× — {b.label}</li>)}</ul>
              </div>
            )}
            <ul className="divide-y divide-card-border rounded-2xl border border-card-border">
              {res.items.map((it) => (
                <li key={it.adId} className="px-4 py-3">
                  <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open === it.adId} onClick={() => setOpen(open === it.adId ? null : it.adId)}>
                    {it.pass ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" />}
                    <span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm font-medium">{it.model ?? it.title}</span><span className="tabular block text-xs text-muted">{formatEuro(it.askingCents)} · winst {formatEuro(it.netProfitCents)} · score {it.score}</span></span>
                    <span className="text-xs text-muted">{it.pass ? "voldoet" : "voldoet niet"}</span>
                  </button>
                  {open === it.adId && (
                    <div className="mt-3 space-y-3 rounded-xl bg-muted-bg/60 p-3">
                      <Tree e={it.explain} />
                      <Link href={`/ads/${it.adId}`} className="text-[13px] font-medium text-accent-strong hover:underline">Open advertentie</Link>
                    </div>
                  )}
                </li>
              ))}
              {res.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nog geen geanalyseerde advertenties om op te testen.</li>}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
