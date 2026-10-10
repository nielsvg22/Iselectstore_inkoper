import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { BAND_LABEL } from "@/lib/engines/scoring";
import type { DealBandKey, RiskLevelKey } from "@/lib/types";

export function ScoreRing({ score, size = 56, blocked }: { score: number; size?: number; blocked?: boolean }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = blocked ? "var(--danger)" : score >= 90 ? "var(--success)" : score >= 75 ? "#34c759" : score >= 60 ? "var(--accent)" : score >= 40 ? "var(--warning)" : "var(--muted)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Dealscore ${score} van 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted-bg)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center font-semibold" style={{ fontSize: size * 0.34 }}>{score}</span>
    </div>
  );
}

const BAND_TONE: Record<DealBandKey, "success" | "accent" | "warning" | "neutral"> = { TOP: "success", VERY_INTERESTING: "success", INTERESTING: "accent", MODERATE: "warning", NOT_INTERESTING: "neutral" };
export function BandBadge({ band, blocked }: { band: DealBandKey; blocked?: boolean }) {
  if (blocked) return <Badge tone="danger">Geblokkeerd</Badge>;
  return <Badge tone={BAND_TONE[band]}>{band === "TOP" ? "🔥 " : ""}{BAND_LABEL[band]}</Badge>;
}

const RISK: Record<RiskLevelKey, { label: string; tone: "success" | "warning" | "danger"; icon: typeof ShieldCheck }> = {
  LOW: { label: "Laag risico", tone: "success", icon: ShieldCheck },
  MEDIUM: { label: "Gemiddeld risico", tone: "warning", icon: AlertTriangle },
  HIGH: { label: "Hoog risico", tone: "danger", icon: ShieldAlert },
  BLOCKED: { label: "Geblokkeerd", tone: "danger", icon: ShieldAlert },
};
export function RiskBadge({ level }: { level: RiskLevelKey | null | undefined }) {
  if (!level) return null;
  const { label, tone, icon: Icon } = RISK[level];
  return (
    <Badge tone={tone}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function Stat({ label, value, tone, className }: { label: string; value: React.ReactNode; tone?: "success" | "danger" | "muted"; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("tabular mt-0.5 text-[17px] font-semibold tracking-tight", tone === "success" && "text-success", tone === "danger" && "text-danger", tone === "muted" && "text-muted")}>{value}</p>
    </div>
  );
}
