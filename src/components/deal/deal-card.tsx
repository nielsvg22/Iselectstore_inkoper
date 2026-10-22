import { flagsEmoji } from "@/lib/notify/message";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatEuro, formatPct, timeAgo } from "@/lib/format";
import { hiRes } from "@/lib/images";
import type { DealBandKey, RiskLevelKey } from "@/lib/types";
import { BandBadge, RiskBadge, ScoreRing, Stat } from "./ui";

export interface DealRow {
  adId: string;
  title: string;
  model: string | null;
  image: string | null;
  askingCents: number;
  expectedCents: number;
  netProfitCents: number;
  conservativeProfitCents: number;
  roiPct: number;
  maxBidCents: number;
  score: number;
  band: DealBandKey;
  blocked: boolean;
  uncertain: boolean;
  risk: RiskLevelKey | null;
  needsReview: boolean;
  location: string | null;
  distanceKm: number | null;
  firstSeenAt: string;
  isDemo: boolean;
  url: string;
  priceKnown: boolean;
  /** vlaggen van de inkoopregels (📍 dichtbij, 🔴 onder 20 km, ✨ krasvrij, 💰 hoge marge …) */
  flags?: string[];
}

export function MaxBid({ d }: { d: Pick<DealRow, "askingCents" | "maxBidCents" | "priceKnown"> }) {
  if (d.maxBidCents <= 0) return <span className="text-muted">Geen winstgevende prijs</span>;
  const diff = d.askingCents - d.maxBidCents;
  return (
    <span>
      Bied max. <strong className="tabular">{formatEuro(d.maxBidCents)}</strong>
      {d.priceKnown && (diff > 0 ? <span className="ml-1.5 text-danger">({formatEuro(diff)} te hoog)</span> : <span className="ml-1.5 text-success">(binnen budget)</span>)}
    </span>
  );
}

export function DealCard({ d }: { d: DealRow }) {
  return (
    <article className="group overflow-hidden rounded-[var(--radius)] border border-card-border bg-card shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-pop">
      <Link href={`/ads/${d.adId}`} className="block" aria-label={`Analyse van ${d.title}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-muted-bg">
          {d.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hiRes(d.image, "card")} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">Geen foto</div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <BandBadge band={d.band} blocked={d.blocked} />
            {d.isDemo && <Badge tone="warning">Voorbeeld</Badge>}
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-card/90 p-0.5 shadow backdrop-blur"><ScoreRing score={d.score} size={48} blocked={d.blocked} /></div>
        </div>
        <div className="p-4 sm:p-5">
          <h3 className={`line-clamp-1 text-[17px] font-semibold tracking-tight ${d.flags?.includes("hot") ? "text-danger" : ""}`}>{d.flags?.includes("hot") ? "❗ " : ""}{d.model ?? d.title}{flagsEmoji(d.flags) ? ` ${flagsEmoji(d.flags)}` : ""}</h3>
          <p className="line-clamp-1 text-[13px] text-muted">{d.title}</p>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <Stat label="Vraagprijs" value={d.priceKnown ? formatEuro(d.askingCents) : "Bieden"} />
            <Stat label={d.uncertain ? "Marktwaarde (onzeker)" : "Marktwaarde"} value={d.expectedCents ? formatEuro(d.expectedCents) : "Onbekend"} tone={d.uncertain ? "muted" : undefined} />
            <Stat label="Verwachte winst" value={d.priceKnown ? formatEuro(d.netProfitCents) : "—"} tone={!d.priceKnown ? "muted" : d.netProfitCents > 0 ? "success" : "danger"} />
            <Stat label="Rendement" value={d.priceKnown ? formatPct(d.roiPct, 0) : "—"} tone={!d.priceKnown ? "muted" : d.roiPct > 0 ? "success" : "danger"} />
          </div>
          <p className="mt-3 rounded-xl bg-muted-bg px-3 py-2 text-[13px]"><MaxBid d={d} /></p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <RiskBadge level={d.risk} />
            {d.needsReview && <Badge tone="warning">Handmatige controle</Badge>}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t border-card-border px-4 py-3 text-xs text-muted sm:px-5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3" />{timeAgo(d.firstSeenAt)}</span>
          {d.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{d.location}{d.distanceKm != null ? ` · ${Math.round(d.distanceKm)} km` : ""}</span></span>}
        </span>
        {d.isDemo ? (
          <span className="shrink-0 text-warning">Geen echte advertentie</span>
        ) : (
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline">
            Marktplaats <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}
