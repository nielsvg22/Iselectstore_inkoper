"use client";
import { Bell, ChevronDown, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { LogoMark } from "@/components/brand/logo";
import { UserMenu } from "./user-menu";

const DISTANCES = [
  ["", "Heel Nederland"],
  ["10", "Binnen 10 km"],
  ["25", "Binnen 25 km"],
  ["50", "Binnen 50 km"],
  ["100", "Binnen 100 km"],
  ["200", "Binnen 200 km"],
] as const;

function SearchForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [dist, setDist] = React.useState(sp.get("dist") ?? "");
  return (
    <form
      role="search"
      className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const n = new URLSearchParams();
        if (q.trim()) n.set("q", q.trim());
        if (dist) n.set("dist", dist);
        router.push(`/deals${n.toString() ? `?${n}` : ""}`);
      }}
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Zoek in advertenties</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek naar iPhone, MacBook, AirPods, iPad..."
          className="h-12 w-full rounded-[16px] border border-card-border bg-card pl-12 pr-5 text-[14px] text-foreground placeholder:text-faint shadow-card transition focus:border-accent focus:bg-card focus:outline-none focus:ring-4 focus:ring-accent-soft dark:bg-muted-bg"
        />
      </label>
      <div className="flex gap-3">
        <label className="relative min-w-0 flex-1 sm:w-[230px] sm:flex-none">
          <span className="sr-only">Locatie</span>
          <MapPin className="pointer-events-none absolute left-4 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-accent" />
          <select
            value={dist}
            onChange={(e) => setDist(e.target.value)}
            className="h-12 w-full appearance-none rounded-[16px] border border-card-border bg-card pl-11 pr-9 text-[14px] text-foreground shadow-card focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
          >
            {DISTANCES.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </label>
        <button type="submit" className="h-12 shrink-0 rounded-[16px] bg-gradient-to-r from-[#F9858B] to-[#EF6570] px-7 text-[14px] font-semibold text-white transition hover:brightness-105 active:scale-[0.98] sm:px-9">
          Zoeken
        </button>
      </div>
    </form>
  );
}

export function Topbar({ name, role, hasNew }: { name: string; role: string; hasNew: boolean }) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center">
      <div className="flex items-center justify-between lg:hidden">
        <Link href="/" className="flex items-center gap-2.5" aria-label="iSelectStore — dashboard">
          <LogoMark size={36} />
          <span className="text-xl font-bold tracking-tight">iSelectStore</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/notifications" aria-label="Meldingen" className="relative flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-card"><Bell className="h-[22px] w-[22px]" />{hasNew && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-card" />}</Link>
          <UserMenu name={name} role={role} />
        </div>
      </div>
      <React.Suspense fallback={<div className="h-12 flex-1 rounded-[16px] bg-muted-bg" />}>
        <SearchForm />
      </React.Suspense>
      <div className="hidden items-center gap-3 lg:flex">
        <Link href="/notifications" aria-label="Meldingen" className="relative flex h-12 w-12 items-center justify-center rounded-full text-foreground/80 transition hover:bg-card hover:shadow-card">
          <Bell className="h-[24px] w-[24px]" />
          {hasNew && <span className="absolute right-[13px] top-[12px] h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />}
        </Link>
        <UserMenu name={name} role={role} />
      </div>
    </header>
  );
}
