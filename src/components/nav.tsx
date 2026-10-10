"use client";
import { Activity, Download, LayoutDashboard, LineChart, Search, Settings, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/", label: "Deals", icon: LayoutDashboard },
  { href: "/profiles", label: "Zoekprofielen", icon: Search },
  { href: "/purchases", label: "Mijn inkopen", icon: ShoppingBag },
  { href: "/market", label: "Marktdata", icon: LineChart },
  { href: "/import", label: "Importeren", icon: Download },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/ads") : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Hoofdnavigatie" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(path, href) ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors", active(path, href) ? "bg-accent-soft text-accent" : "text-foreground/75 hover:bg-muted-bg hover:text-foreground")}
        >
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const items = [NAV[0], NAV[1], NAV[2], NAV[5], NAV[6]];
  return (
    <nav aria-label="Hoofdnavigatie" className="fixed inset-x-0 bottom-0 z-40 border-t border-card-border bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link href={href} aria-current={active(path, href) ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active(path, href) ? "text-accent" : "text-muted")}>
              <Icon className="h-5 w-5" />
              {label.split(" ").pop()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
