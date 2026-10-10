"use client";
import { Filter, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FilterBuilder, type FilterState } from "@/components/filters/filter-builder";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { FIELD_DEFS, type Group } from "@/lib/engines/filters";
import { buildTree, emptyQuick, summarizeFilter, treeToQuick } from "@/lib/profile-quick";

export interface SavedFilterRow {
  id: string;
  name: string;
  tree: Group;
}

const emptyState = (): FilterState => ({ quick: emptyQuick(), groups: [] });

/** "Mijn filters": eigen, herbruikbare filters maken, wijzigen en verwijderen. */
export function SavedFiltersManager({ filters }: { filters: SavedFilterRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<{ id: string | null; name: string; state: FilterState } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      const body = { name: editing.name, tree: buildTree(editing.state.quick, editing.state.groups, FIELD_DEFS) };
      if (editing.id) await api(`/api/filters/${editing.id}`, { method: "PUT", body });
      else await api("/api/filters", { body });
      toast("Filter opgeslagen");
      setEditing(null);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4 text-accent" />Mijn filters</CardTitle>
          <CardDescription>Maak eigen filters met producten uit de Apple-lijst, prijs, winst, afstand en meer. Gebruik ze op het dashboard (&ldquo;Mijn filters&rdquo;) en laad ze in zoekprofielen.</CardDescription>
        </div>
        {!editing && <Button size="sm" onClick={() => setEditing({ id: null, name: "", state: emptyState() })}><Plus className="h-3.5 w-3.5" />Nieuw filter</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing && filters.length === 0 && <p className="text-sm text-muted">Je hebt nog geen eigen filters. Maak er één met &ldquo;Nieuw filter&rdquo;.</p>}
        {!editing && filters.length > 0 && (
          <ul className="space-y-2">
            {filters.map((f) => {
              const { quick, groups } = treeToQuick(f.tree);
              const parts = summarizeFilter(quick, groups);
              return (
                <li key={f.id} className="flex items-start justify-between gap-3 rounded-2xl border border-card-border p-3.5">
                  <div className="min-w-0">
                    <p className="font-medium">{f.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">{parts.length ? parts.map((p) => <Badge key={p} tone="neutral">{p}</Badge>) : <span className="text-xs text-muted">Geen voorwaarden (alles)</span>}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Bewerk ${f.name}`} onClick={() => setEditing({ id: f.id, name: f.name, state: { quick, groups } })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Verwijder ${f.name}`}
                      onClick={async () => {
                        if (!confirm(`Filter “${f.name}” verwijderen?`)) return;
                        try {
                          await api(`/api/filters/${f.id}`, { method: "DELETE" });
                          toast("Filter verwijderd");
                          router.refresh();
                        } catch (e) {
                          toast((e as Error).message, "err");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {editing && (
          <div className="space-y-5">
            <Field label="Naam van het filter" htmlFor="sf-name"><Input id="sf-name" maxLength={80} placeholder="Bijv. iPhone 16 Pro Max onder €700" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <div className="space-y-6"><FilterBuilder state={editing.state} onChange={(st) => setEditing({ ...editing, state: st })} /></div>
            {err && <Notice tone="danger">{err}</Notice>}
            <div className="flex gap-3">
              <Button loading={busy} onClick={save}>{editing.id ? "Wijzigingen opslaan" : "Filter opslaan"}</Button>
              <Button variant="ghost" onClick={() => { setEditing(null); setErr(null); }}>Annuleren</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
