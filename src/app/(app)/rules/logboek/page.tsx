import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { filterLog } from "@/lib/rules/log";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Filterlogboek" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATUS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  high: { label: "💰 Hoge marge", tone: "success" }, match: { label: "Doorgelaten", tone: "success" }, review: { label: "Handmatig controleren", tone: "warning" },
  reject: { label: "Uitgesloten", tone: "danger" }, skip: { label: "Geen oordeel", tone: "neutral" },
};

export default async function LogPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const platform = one(sp.platform) === "vinted" ? "vinted" : one(sp.platform) === "marktplaats" ? "marktplaats" : undefined;
  const status = one(sp.status) || undefined;
  const log = await filterLog({ platform, status, limit: 300 });
  const link = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams();
    const merged = { platform, status, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) n.set(k, v);
    return `/rules/logboek${n.size ? `?${n}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Filterlogboek</h1>
        <p className="mt-1 text-muted">Waarom advertenties wel of niet zijn doorgelaten, per platform. <Link href="/rules" className="underline">Terug naar Inkoopregels</Link>.</p>
      </div>
      <Card>
        <CardHeader><div><CardTitle>Overzicht</CardTitle><CardDescription>De laatste {log.rows.length} beoordeelde advertenties{platform ? ` (${platform})` : ""}.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            {([undefined, "marktplaats", "vinted"] as const).map((p) => (
              <Link key={p ?? "all"} href={link({ platform: p })} className={`rounded-full border px-3.5 py-1.5 ${platform === p ? "border-accent bg-accent-soft" : "border-border"}`}>{p === "vinted" ? "Vinted" : p === "marktplaats" ? "Marktplaats" : "Alle platforms"}</Link>
            ))}
            <span className="mx-1 text-muted">|</span>
            {([undefined, "match", "high", "review", "reject"] as const).map((st) => (
              <Link key={st ?? "all"} href={link({ status: st })} className={`rounded-full border px-3.5 py-1.5 ${status === st ? "border-accent bg-accent-soft" : "border-border"}`}>{st ? STATUS[st].label : "Alle uitkomsten"}{st && log.byStatus[st] != null ? ` (${log.byStatus[st]})` : ""}</Link>
            ))}
          </div>
          {(Object.values(log.dropped).some((d) => Object.keys(d).length > 0)) && (
            <p className="text-sm text-muted">Vandaag al bij het ophalen weggelaten (accessoires en koopadvertenties):{" "}
              {(["marktplaats", "vinted"] as const).filter((p2) => !platform || platform === p2).map((p2) => `${p2 === "vinted" ? "Vinted" : "Marktplaats"} ${log.dropped[p2].accessory ?? 0} accessoires, ${log.dropped[p2].buying ?? 0} koopadvertenties`).join(" · ")}.
            </p>
          )}
          {log.byStep.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Waarom uitgesloten (aantal per stap)</p>
              <div className="flex flex-wrap gap-2">{log.byStep.map((s) => <Badge key={s.step} tone="neutral">{s.title}: {s.n}</Badge>)}</div>
            </div>
          )}
          <div className="overflow-auto rounded-2xl border border-card-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted-bg text-left text-xs text-muted"><tr><th className="px-3 py-2">Advertentie</th><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Prijs</th><th className="px-3 py-2">Uitkomst</th><th className="px-3 py-2">Reden</th></tr></thead>
              <tbody>
                {log.rows.map((r) => (
                  <tr key={r.adId} className="border-t border-card-border align-top">
                    <td className="px-3 py-2"><Link href={`/ads/${r.adId}`} className="font-medium underline-offset-2 hover:underline">{r.title.slice(0, 70)}</Link></td>
                    <td className="px-3 py-2">{r.source === "vinted" ? "Vinted" : "Marktplaats"}</td>
                    <td className="px-3 py-2">{r.askEuro != null ? `€${r.askEuro}` : "—"}</td>
                    <td className="px-3 py-2"><Badge tone={(STATUS[r.status] ?? STATUS.skip).tone}>{(STATUS[r.status] ?? STATUS.skip).label}</Badge></td>
                    <td className="px-3 py-2 text-muted">{r.stepTitle ? <span className="font-medium text-foreground/80">{r.stepTitle}: </span> : null}{r.reason}{r.profitEuro != null ? ` · winst €${r.profitEuro}` : ""}</td>
                  </tr>
                ))}
                {log.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Nog niets beoordeeld voor deze selectie.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
