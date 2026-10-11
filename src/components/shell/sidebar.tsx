"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { isActive, MAIN_NAV, MORE_NAV } from "./nav-items";

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="relative hidden h-[calc(100dvh-3rem)] w-[262px] shrink-0 flex-col overflow-hidden rounded-[30px] bg-navy px-5 pb-6 pt-7 text-white shadow-pop lg:sticky lg:top-6 lg:flex" aria-label="Zijbalk">
      <div className="px-1"><Logo /></div>

      <nav aria-label="Hoofdnavigatie" className="relative mt-12 flex flex-col gap-2">
        {MAIN_NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-4 rounded-[18px] px-5 py-3.5 text-[15px] font-medium transition-all",
                on ? "bg-gradient-to-r from-[#F9858B] to-[#EF6570] text-white" : "text-white/85 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={on ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Beheer" className="relative mt-auto flex flex-col gap-1 border-t border-white/10 pt-6">
        <p className="mb-2 px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Beheer</p>
        {MORE_NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-3.5 rounded-[14px] px-5 py-2.5 text-[14px] transition-colors", on ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/8 hover:text-white")}>
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
