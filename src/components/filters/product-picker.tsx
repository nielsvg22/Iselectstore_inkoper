"use client";
import { Search } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { APPLE_MODELS, modelByKey, type CatalogModel } from "@/lib/catalog/apple";

const TABS: Array<{ id: string; label: string; families: string[] }> = [
  { id: "all", label: "Alles", families: [] },
  { id: "iphone", label: "iPhone", families: ["iphone"] },
  { id: "macbook", label: "MacBook", families: ["macbook_air", "macbook_pro"] },
  { id: "ipad", label: "iPad", families: ["ipad"] },
  { id: "watch", label: "Watch", families: ["watch"] },
  { id: "airpods", label: "AirPods", families: ["airpods"] },
  { id: "mac", label: "Mac mini / iMac / Studio", families: ["mac_mini", "imac", "mac_studio"] },
  { id: "acc", label: "Accessoires", families: ["accessory"] },
];

/** Doorzoekbare keuzelijst met alle Apple-modellen, gegroepeerd per productlijn. */
export function ProductPicker({ value, onChange }: { value: string[]; onChange: (keys: string[]) => void }) {
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("all");
  const families = TABS.find((t) => t.id === tab)!.families;
  const needle = q.trim().toLowerCase();
  const shown = APPLE_MODELS.filter((m) => (!families.length || families.includes(m.family)) && (!needle || `${m.label} ${m.term} ${m.key}`.toLowerCase().includes(needle)));
  const groups = new Map<string, CatalogModel[]>();
  for (const m of shown) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  const toggleGroup = (list: CatalogModel[]) => {
    const keys = list.map((m) => m.key);
    onChange(keys.every((k) => value.includes(k)) ? value.filter((k) => !keys.includes(k)) : [...new Set([...value, ...keys])]);
  };
  const custom = value.filter((k) => !modelByKey(k));
  const [draft, setDraft] = React.useState("");
  return (
    <div className="space-y-3" role="group" aria-label="Productmodellen">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Gekozen modellen">
          {value.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
              {modelByKey(k)?.label ?? k}
              <button type="button" aria-label={`Verwijder ${modelByKey(k)?.label ?? k}`} onClick={() => toggle(k)} className="rounded-full px-0.5 hover:bg-accent/20">×</button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} className="px-1 text-xs text-muted underline-offset-2 hover:underline">Alles wissen</button>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input aria-label="Zoek product" placeholder="Zoek een model, bijv. 16 pro max, m3, series 9…" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Productfamilie">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("rounded-full px-3.5 py-1.5 text-sm transition", tab === t.id ? "bg-foreground text-background" : "bg-muted-bg text-muted hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-80 space-y-4 overflow-y-auto rounded-2xl border border-border p-3">
        {groups.size === 0 && <p className="py-4 text-center text-sm text-muted">Geen modellen gevonden. Voeg hieronder een eigen model-sleutel toe.</p>}
        {[...groups.entries()].map(([g, list]) => {
          const all = list.every((m) => value.includes(m.key));
          return (
            <div key={g}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</p>
                <button type="button" onClick={() => toggleGroup(list)} className="text-xs text-accent hover:underline">{all ? "Geen" : "Alles"}</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((m) => {
                  const on = value.includes(m.key);
                  return (
                    <button key={m.key} type="button" aria-pressed={on} onClick={() => toggle(m.key)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", on ? "border-accent bg-accent-soft text-accent" : "border-border text-foreground/85 hover:bg-muted-bg")}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <Input
          id="q-models"
          aria-label="Eigen model-sleutel toevoegen"
          placeholder="Eigen model-sleutel (bijv. iphone-15-pro) + Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const k = draft.trim().toLowerCase();
              if (/^[a-z0-9]+(-[a-z0-9_]+)*$/.test(k) && !value.includes(k)) onChange([...value, k]);
              setDraft("");
            }
          }}
        />
        {custom.length > 0 && <p className="mt-1 text-xs text-muted">Eigen sleutels: {custom.join(", ")}</p>}
      </div>
    </div>
  );
}
