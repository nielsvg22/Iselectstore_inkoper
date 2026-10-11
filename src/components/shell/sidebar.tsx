"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { isActive, MAIN_NAV, MORE_NAV } from "./nav-items";

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="relative hidden h-[calc(100dvh-2.5rem)] w-[262px] shrink-0 flex-col overflow-hidden rounded-[30px] bg-navy px-5 pb-6 pt-7 text-white shadow-pop lg:sticky lg:top-5 lg:flex" aria-label="Zijbalk">
      {/* decoratieve lijnen onderaan, zoals in het ontwerp */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] w-full" viewBox="0 0 262 360" fill="none" aria-hidden preserveAspectRatio="xMidYMax slice">
        <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f9858b" stopOpacity="0"/><stop offset="1" stopColor="#f9858b" stopOpacity=".55"/></linearGradient></defs>
        <g stroke="url(#fade)" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M-20 300 L120 120 L205 250 L262 205" />
          <path d="M70 360 L150 190 L262 330" />
          <path d="M-30 190 L40 130 L110 215 L40 290Z" />
          <path d="M150 360 L205 250" />
        </g>
        <rect x="0" y="0" width="262" height="360" fill="url(#fade)" opacity=".05" />
      </svg>

      <div className="px-1"><Logo /></div>

      <nav aria-label="Hoofdnavigatie" className="relative mt-9 flex flex-col gap-1.5">
        {MAIN_NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-4 rounded-[18px] px-5 py-3.5 text-[16px] font-medium transition-all",
                on ? "bg-gradient-to-r from-[#F9858B] to-[#EF6570] text-white shadow-[0_10px_24px_rgba(239,101,112,0.35)]" : "text-white/85 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={on ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Beheer" className="relative mt-7 flex flex-col gap-0.5 border-t border-white/10 pt-5">
        <p className="mb-2 px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Beheer</p>
        {MORE_NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-3.5 rounded-[14px] px-5 py-2.5 text-[14.5px] transition-colors", on ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/8 hover:text-white")}>
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
