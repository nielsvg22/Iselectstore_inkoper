import { Activity, ListChecks, Mail, ScrollText, SlidersHorizontal, BarChart3, Gauge, Smartphone, Bell, Download, LayoutGrid, LineChart, Filter, Scale, Search, Settings, ShoppingBag, Tag } from "lucide-react";

export const MAIN_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/profiles", label: "Zoekopdrachten", icon: Search },
  { href: "/deals", label: "Deals", icon: Tag },
  { href: "/notifications", label: "Meldingen", icon: Bell },
  { href: "/stats", label: "Statistieken", icon: BarChart3 },
  { href: "/settings", label: "Instellingen", icon: Settings },
] as const;

export const MORE_NAV = [
  { href: "/purchases", label: "Mijn inkopen", icon: ShoppingBag },
  { href: "/rules", label: "Inkoopregels", icon: Scale },
  { href: "/rules/zoekfilters", label: "Modellenlijst", icon: ListChecks },
  { href: "/rules/filters", label: "Algemene filters", icon: SlidersHorizontal },
  { href: "/rules/logboek", label: "Filterlogboek", icon: ScrollText },
  { href: "/rules/automsg", label: "Auto-berichten", icon: Mail },
  { href: "/funnel", label: "Funnel & aanbod", icon: Filter },
  { href: "/market", label: "Marktdata", icon: LineChart },
  { href: "/import", label: "Importeren", icon: Download },
  { href: "/performance", label: "Prestaties", icon: Gauge },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/install", label: "App installeren", icon: Smartphone },
] as const;

export function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  if (href === "/rules") return path === "/rules" || path.startsWith("/rules/beslisboom");
  if (href === "/deals") return path.startsWith("/deals") || path.startsWith("/ads");
  return path === href || path.startsWith(href + "/");
}
