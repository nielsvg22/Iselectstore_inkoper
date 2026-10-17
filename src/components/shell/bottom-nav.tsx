"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActive, MAIN_NAV, MORE_NAV } from "./nav-items";

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Hoofdnavigatie mobiel"
      className="fixed inset-x-3 bottom-3 z-40 rounded-[26px] bg-navy/95 px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 shadow-pop backdrop-blur-xl lg:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {MAIN_NAV.filter((item) =>
          ["/", "/deals", "/notifications"].includes(item.href),
        ).map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-[20px] py-2 text-[9.5px] font-medium tracking-tight transition",
                  on
                    ? "bg-gradient-to-b from-[#F9858B] to-[#EF6570] text-white"
                    : "text-white/70",
                )}
              >
                <Icon className="h-[19px] w-[19px]" />
                {href === "/" ? "Radar" : label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-col items-center gap-0.5 rounded-[20px] py-2 text-xs text-white/70">
              <span
                className="h-[19px] text-lg leading-none"
                aria-hidden="true"
              >
                ···
              </span>
              Meer
            </summary>
            <div className="absolute bottom-full left-0 right-0 mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-card-border bg-card p-4 text-foreground shadow-pop">
              {[
                ...MAIN_NAV.filter(
                  (item) =>
                    !["/", "/deals", "/notifications"].includes(item.href),
                ),
                ...MORE_NAV,
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl p-3 text-xs hover:bg-muted-bg"
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </li>
      </ul>
    </nav>
  );
}
