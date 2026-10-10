import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatEuro, formatPct, timeAgo } from "@/lib/format";
import type { DealRow } from "./deal-card";
import { BandBadge, RiskBadge, ScoreRing } from "./ui";

export function DealTable({ rows }: { rows: DealRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-card-border bg-card shadow-card">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead>
          <tr className="border-b border-card-border text-xs uppercase tracking-wide text-muted">
            {["Score", "Product", "Vraagprijs", "Marktwaarde", "Winst", "Rendement", "Max. bod", "Risico", "Locatie", "Gevonden"].map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.adId} className="border-b border-card-border last:border-0 transition-colors hover:bg-muted-bg/60">
              <td className="px-4 py-3"><ScoreRing score={d.score} size={40} blocked={d.blocked} /></td>
              <td className="max-w-[260px] px-4 py-3">
                <Link href={`/ads/${d.adId}`} className="block font-medium hover:text-accent">
                  <span className="line-clamp-1">{d.model ?? d.title}</span>
                </Link>
                <div className="mt-1 flex gap-1.5"><BandBadge band={d.band} blocked={d.blocked} />{d.isDemo && <Badge tone="warning">Voorbeeld</Badge>}</div>
              </td>
              <td className="tabular px-4 py-3">{d.priceKnown ? formatEuro(d.askingCents) : "Bieden"}</td>
              <td className="tabular px-4 py-3">{d.expectedCents ? formatEuro(d.expectedCents) : "—"}{d.uncertain && <span title="Onzekere waardering" className="ml-1 text-warning">⚠</span>}</td>
              <td className={`tabular px-4 py-3 font-semibold ${!d.priceKnown ? "text-muted" : d.netProfitCents > 0 ? "text-success" : "text-danger"}`}>{d.priceKnown ? formatEuro(d.netProfitCents) : "—"}</td>
              <td className="tabular px-4 py-3">{d.priceKnown ? formatPct(d.roiPct, 0) : "—"}</td>
              <td className="tabular px-4 py-3">{d.maxBidCents > 0 ? formatEuro(d.maxBidCents) : "—"}</td>
              <td className="px-4 py-3"><RiskBadge level={d.risk} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{d.location ?? "—"}{d.distanceKm != null ? ` · ${Math.round(d.distanceKm)} km` : ""}</td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{timeAgo(d.firstSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
