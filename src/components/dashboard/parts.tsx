import { ArrowRight, ArrowUp, ArrowDown, BarChart3, Flame, LayoutGrid, Laptop, MoreHorizontal, Search, Smartphone, Tablet, ThumbsUp, Watch, Headphones, Tag, TrendingUp } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { artSrc, type ArtKey } from "@/lib/product-art";
import { hiRes } from "@/lib/images";
import { artFor } from "@/lib/product-art";
import type { DealBadgeInfo } from "@/lib/deal-badge";

/* ------------------------------ product thumbnail ------------------------------ */
export function Thumb({ image, family, size = 48, className }: { image: string | null; family: string | null; size?: number; className?: string }) {
  const art = artFor(family);
  if (image?.startsWith("/api/demo-image") && art) image = null;
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#f3f2f4] dark:bg-muted-bg", className)} style={{ width: size, height: size }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hiRes(image, "thumb")} alt="" loading="lazy" width={size} height={size} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artSrc(art)} alt="" width={size} height={size} className="product-art h-[78%] w-[78%]" />
      ) : (
        <Tag className="h-1/2 w-1/2 text-faint" />
      )}
    </span>
  );
}

/* ---------------------------------- chips ---------------------------------- */
const CHIPS: Array<{ id: string; label: string; icon: typeof LayoutGrid }> = [
  { id: "", label: "Alle categorieën", icon: LayoutGrid },
  { id: "iphone", label: "iPhone", icon: Smartphone },
  { id: "macbook", label: "MacBook", icon: Laptop },
  { id: "airpods", label: "AirPods", icon: Headphones },
  { id: "ipad", label: "iPad", icon: Tablet },
  { id: "watch", label: "Apple Watch", icon: Watch },
  { id: "more", label: "Meer", icon: MoreHorizontal },
];

export function CategoryChips({ active, base = "/", param = "cat" }: { active: string; base?: string; param?: string }) {
  return (
    <nav aria-label="Categorie" className="-mx-1 flex gap-2.5 overflow-x-auto px-1 py-1">
      {CHIPS.map(({ id, label, icon: Icon }) => {
        const on = (active || "") === id;
        return (
          <Link
            key={id || "all"}
            href={id ? `${base}?${param}=${id}` : base}
            aria-current={on ? "true" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center gap-2.5 rounded-full px-5 text-[14px] font-medium transition",
              on ? "bg-navy text-white" : "bg-card text-muted hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/* --------------------------------- stat tile --------------------------------- */
function Wave({ values }: { values: number[] }) {
  const w = 150;
  const h = 46;
  const v = values.length > 1 ? values : [0, 0, 0, 0, 0, 0, 0];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 8 - ((x - min) / span) * (h - 18)] as const);
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute bottom-3 right-4 h-[46px] w-[150px]" aria-hidden fill="none">
      <defs><linearGradient id="wv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f9858b" stopOpacity=".18"/><stop offset="1" stopColor="#f9858b" stopOpacity="0"/></linearGradient></defs>
      <path d={`${d} L${w},${h} L0,${h}Z`} fill="url(#wv)" />
      <path d={d} stroke="#f9a3a8" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function StatTile({ title, value, sub, delta, deltaLabel, icon: Icon, series }: { title: string; value: string; sub?: string; delta?: number | null; deltaLabel?: string; icon: typeof TrendingUp; series: number[] }) {
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-card p-7 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium leading-tight text-muted">{title}</p>
          <p className="tabular mt-3 text-[32px] font-semibold leading-none tracking-tight">{value}</p>
        </div>
        <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
      </div>
      <p className="relative z-10 mt-5 text-[13px] text-faint">
        {delta != null ? (
          <span className="tabular inline-flex items-center gap-1">
            <span className={cn("inline-flex items-center gap-0.5 font-bold", delta >= 0 ? "text-success" : "text-danger")}>
              {delta >= 0 ? <ArrowUp className="h-4 w-4" strokeWidth={3} /> : <ArrowDown className="h-4 w-4" strokeWidth={3} />}
              {delta >= 0 ? "+" : ""}{delta}%
            </span>
            {deltaLabel}
          </span>
        ) : (
          sub
        )}
      </p>
    </div>
  );
}

export const STAT_ICONS = { newDeals: TrendingUp, margin: BarChart3, profiles: Search, priceDiff: Tag };

/* ------------------------------ category cards ------------------------------ */
export function CategoryCard({ id, label, art, count }: { id: string; label: string; art: string | null; count: number }) {
  return (
    <Link href={`/deals?family=${id}`} className="group flex min-w-0 flex-col items-center gap-2 rounded-[22px] bg-card p-4 text-center shadow-card transition hover:shadow-pop sm:flex-row sm:text-left">
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artSrc(art as ArtKey)} alt="" width={68} height={68} className="product-art h-[68px] w-[68px] shrink-0 transition-transform duration-300 group-hover:scale-105" loading="lazy" />
      )}
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        <span className="tabular mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-muted">
          {count.toLocaleString("nl-NL")} deals <ArrowRight className="h-3.5 w-3.5 text-accent" />
        </span>
      </span>
    </Link>
  );
}

/* --------------------------------- action pill --------------------------------- */
const PILL: Record<DealBadgeInfo["tone"], string> = {
  success: "bg-[#e3f8ea] text-[#1b9a58]",
  info: "bg-[#edf1ff] text-[#3f63e0]",
  warning: "bg-[#ffede3] text-[#f26b30]",
  neutral: "bg-muted-bg text-muted",
};
export function ActionPill({ badge }: { badge: DealBadgeInfo }) {
  const Icon = badge.icon === "thumb" ? ThumbsUp : Flame;
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium", PILL[badge.tone])}>
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
      {badge.label}
    </span>
  );
}

/* ----------------------------------- banner ----------------------------------- */
export function CtaBanner() {
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-navy-2 px-7 py-6 text-white sm:px-8" aria-label="Nieuwe zoekopdracht">
      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <LogoMark size={52} tile />
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">Laat de tool voor jou werken</h2>
            <p className="mt-0.5 text-[14px] text-white/70">Stel je zoekopdrachten in en ontvang direct meldingen bij de beste deals.</p>
          </div>
        </div>
        <Link href="/profiles/new" className="inline-flex h-12 items-center gap-3 rounded-[16px] bg-gradient-to-r from-[#F9858B] to-[#EF6570] px-7 text-[15px] font-semibold text-white transition hover:brightness-105 active:scale-[0.98]">
          Nieuwe zoekopdracht aanmaken <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}
