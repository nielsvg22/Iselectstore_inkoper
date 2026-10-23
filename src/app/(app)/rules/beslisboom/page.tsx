import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db/client";
import { evaluateAdById, loadRules } from "@/lib/rules/apply";
import { traceSteps, STEPS } from "@/lib/rules/steps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beslisboom inkoopregels" };

const STATUS = { high: ["💰 Hoge marge", "success"], match: ["Voldoet", "success"], review: ["Handmatig controleren", "warning"], reject: ["Afgewezen", "danger"], skip: ["Geen oordeel", "neutral"] } as const;
const DOT = { passed: "border-success bg-success-soft text-success", decided: "border-danger bg-danger-soft text-danger", "not-reached": "border-card-border bg-muted-bg text-muted" } as const;

export default async function DecisionTreePage({ searchParams }: { searchParams: Promise<{ ad?: string }> }) {
  const sp = await searchParams;
  const { cfg } = await loadRules(true);
  const recent = await prisma.advertisement.findMany({ where: { isDemo: false, product: { isNot: null } }, orderBy: { firstSeenAt: "desc" }, take: 25, select: { id: true, title: true } });
  const selected = sp.ad ? await evaluateAdById(sp.ad) : null;
  const trace = selected ? traceSteps(selected.verdict, cfg) : null;
  const rows = trace ?? STEPS.map((s) => ({ id: s.id, title: s.title, rule: s.rule(cfg), state: "passed" as const, outcome: undefined as string | undefined }));
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Beslisboom</h1>
        <p className="mt-1 text-muted">Alle stappen waarmee de inkoopregels een advertentie beoordelen, in volgorde en met de waarden uit <Link href="/rules" className="underline">Inkoopregels</Link>. Kies een advertentie om te zien waar hij is blijven hangen.</p>
      </div>

      <Card>
        <CardHeader><div><CardTitle>Advertentie kiezen</CardTitle><CardDescription>De laatste 25 advertenties. De beoordeling gebruikt de huidige regels en wordt niet opgeslagen.</CardDescription></div>{sp.ad && <Link href="/rules/beslisboom" className="text-sm underline">Zonder advertentie</Link>}</CardHeader>
        <CardContent>
          {recent.length === 0 ? <p className="text-sm text-muted">Nog geen advertenties.</p> : (
            <ul className="flex flex-wrap gap-2">
              {recent.map((a) => <li key={a.id}><Link href={`/rules/beslisboom?ad=${a.id}`} className={`inline-block max-w-[260px] truncate rounded-full border px-3 py-1 text-sm ${sp.ad === a.id ? "border-accent bg-accent-soft text-accent" : "border-card-border text-muted hover:bg-muted-bg"}`}>{a.title}</Link></li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-card-border bg-ivory p-4" role="status">
          <Badge tone={STATUS[selected.verdict.status][1]}>{STATUS[selected.verdict.status][0]}</Badge>
          <Link href={`/ads/${sp.ad}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{selected.title}</Link>
          {selected.verdict.reasons[0] && <span className="w-full text-sm text-muted">{selected.verdict.reasons[0]}</span>}
        </div>
      )}
      {sp.ad && !selected && <p className="text-sm text-muted">Deze advertentie is niet gevonden of nog niet herkend.</p>}

      <ol className="space-y-3" aria-label="Stappen">
        {rows.map((r, i) => (
          <li key={r.id} className={`flex gap-4 rounded-2xl border p-4 ${r.state === "decided" ? "border-danger bg-danger-soft/40" : "border-card-border bg-card"} ${selected && r.state === "not-reached" ? "opacity-60" : ""}`} data-state={selected ? r.state : "algemeen"}>
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${selected ? DOT[r.state] : "border-card-border bg-muted-bg text-muted"}`}>{i + 1}</span>
            <div className="min-w-0">
              <p className="font-medium">{r.title}{selected && r.state === "passed" && <span className="ml-2 text-xs text-success">doorlopen</span>}{selected && r.state === "not-reached" && <span className="ml-2 text-xs text-muted">niet bereikt</span>}</p>
              <p className="mt-0.5 text-sm text-muted">{r.rule}</p>
              {r.outcome && <p className={`mt-1 text-sm font-medium ${r.state === "decided" ? "text-danger" : "text-foreground"}`}>{r.outcome}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
