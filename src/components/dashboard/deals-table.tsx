import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { dealBadge } from "@/lib/deal-badge";
import { formatEuro, timeAgo } from "@/lib/format";
import type { DealRowLite } from "@/lib/dashboard";
import { ActionPill, Thumb } from "./parts";
import { RowMenu } from "./row-menu";

export function NewestDealsCard({ rows, topScore, urls }: { rows: DealRowLite[]; topScore: number; urls: Record<string, string> }) {
  return (
    <section className="rounded-[24px] bg-card p-5 shadow-card sm:p-6" aria-label="Nieuwste deals">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold tracking-tight">Nieuwste deals</h2>
        <Link href="/deals?sort=new" className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-accent-strong hover:underline">Bekijk alle deals <ArrowRight className="h-4 w-4" /></Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nog geen deals. Maak een zoekopdracht aan of importeer advertenties.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-[13px] text-faint">
                {["Product", "Prijs", "Marktprijs", "Verwachte marge", "Geplaatst", "Actie", ""].map((h) => (<th key={h} scope="col" className="pb-3 pr-3 font-medium">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = dealBadge({ score: r.score, blocked: r.blocked, askingCents: r.askingCents, expectedCents: r.expectedCents, netProfitCents: r.netProfitCents, ageMinutes: (Date.now() - new Date(r.firstSeenAt).getTime()) / 60000, topScore });
                return (
                  <tr key={r.adId} className="border-t border-card-border transition-colors hover:bg-muted-bg/50">
                    <td className="py-3 pr-3">
                      <Link href={`/ads/${r.adId}`} className="flex items-center gap-3.5">
                        <Thumb image={r.image} family={r.family} size={46} />
                        <span className="min-w-0"><span className="line-clamp-1 text-[15px] font-semibold">{r.model}</span>{r.variant && <span className="line-clamp-1 text-[13px] text-muted">{r.variant}</span>}</span>
                      </Link>
                    </td>
                    <td className="tabular whitespace-nowrap py-3 pr-3 text-[17px] font-bold">{formatEuro(r.askingCents)}</td>
                    <td className="tabular whitespace-nowrap py-3 pr-3 text-[15px] text-faint">{formatEuro(r.expectedCents)}</td>
                    <td className={`tabular whitespace-nowrap py-3 pr-3 text-[16px] font-bold ${r.netProfitCents >= 0 ? "text-success" : "text-danger"}`}>{r.netProfitCents >= 0 ? "+ " : "− "}{formatEuro(Math.abs(r.netProfitCents))}</td>
                    <td className="whitespace-nowrap py-3 pr-3 text-[14px] text-muted">{timeAgo(r.firstSeenAt)}</td>
                    <td className="py-3 pr-3"><ActionPill badge={badge} /></td>
                    <td className="py-3"><RowMenu adId={r.adId} url={urls[r.adId] ?? ""} isDemo={r.isDemo} title={r.model} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
