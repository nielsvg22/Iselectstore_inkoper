"use client";
import { LayoutGrid, Rows3, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export function FiltersBar({ profiles, savedFilters = [] }: { profiles: Array<{ id: string; name: string }>; savedFilters?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const set = React.useCallback(
    (patch: Record<string, string | null>) => {
      const n = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
      n.delete("offset");
      router.replace(`${path}?${n.toString()}`, { scroll: false });
    },
    [router, path, sp],
  );
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q: q || null });
    }, 350);
    return () => clearTimeout(t);
  }, [q, sp, set]);
  const view = sp.get("view") === "table" ? "table" : "cards";
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input aria-label="Filter op titel" placeholder="Filter op titel…" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Select aria-label="Sorteren" value={sp.get("sort") ?? "score"} onChange={(e) => set({ sort: e.target.value === "score" ? null : e.target.value })}>
          <option value="score">Beste score</option>
          <option value="profit">Hoogste winst</option>
          <option value="roi">Hoogste rendement</option>
          <option value="new">Nieuwste</option>
          <option value="price">Laagste prijs</option>
        </Select>
        <Select aria-label="Dealniveau" value={sp.get("band") ?? ""} onChange={(e) => set({ band: e.target.value || null })}>
          <option value="">Alle niveaus</option>
          <option value="TOP">Topdeals</option>
          <option value="VERY_INTERESTING">Zeer interessant</option>
          <option value="INTERESTING">Interessant</option>
          <option value="MODERATE">Matig</option>
        </Select>
        <Select aria-label="Productfamilie" value={sp.get("family") ?? ""} onChange={(e) => set({ family: e.target.value || null })}>
          <option value="">Alle producten</option>
          <option value="iphone">iPhone</option>
          <option value="macbook_air">MacBook Air</option>
          <option value="macbook_pro">MacBook Pro</option>
          <option value="ipad">iPad</option>
          <option value="watch">Apple Watch</option>
          <option value="airpods">AirPods</option>
        </Select>
        <Select aria-label="Platform" value={sp.get("platform") ?? ""} onChange={(e) => set({ platform: e.target.value || null })}>
          <option value="">Alle platforms</option>
          <option value="marktplaats">Marktplaats</option>
          <option value="vinted">Vinted</option>
        </Select>
        <Select aria-label="Mijn filters" value={sp.get("filter") ?? ""} onChange={(e) => set({ filter: e.target.value || null })}>
          <option value="">{savedFilters.length ? "Mijn filters" : "Geen eigen filters"}</option>
          {savedFilters.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
        </Select>
        <Select aria-label="Zoekprofiel" value={sp.get("profile") ?? ""} onChange={(e) => set({ profile: e.target.value || null })}>
          <option value="">Alle profielen</option>
          {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={sp.get("review") === "1"} onChange={(e) => set({ review: e.target.checked ? "1" : null })} />
          Te controleren
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={sp.get("blocked") === "1"} onChange={(e) => set({ blocked: e.target.checked ? "1" : null })} />
          Toon geblokkeerd
        </label>
        <div className="ml-auto inline-flex rounded-full bg-muted-bg p-1" role="group" aria-label="Weergave">
          {([["cards", LayoutGrid, "Kaarten"], ["table", Rows3, "Tabel"]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" aria-pressed={view === v} aria-label={label} onClick={() => set({ view: v === "cards" ? null : v })} className={cn("rounded-full p-2 transition", view === v ? "bg-card text-foreground shadow" : "text-muted hover:text-foreground")}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
