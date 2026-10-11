import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IphoneMelder } from "@/components/profile/iphone-melder";
import { GroupActions } from "@/components/profile/group-actions";
import { ProfileActions } from "@/components/profile/profile-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { formatDate, timeAgo } from "@/lib/format";
import { adapterForOrigin } from "@/lib/sources/adapters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Zoekprofielen" };

const SOURCE = { SEARCH: "Marktplaats-zoekopdracht", MANUAL_URL: "Advertentie-URL's", FEED: "Feed", DEMO: "Demodata", IMPORT: "Import", PARTNER_API: "Partner-API" } as const;

export default async function ProfilesPage() {
  const user = await getCurrentUser();
  const all = await prisma.searchProfile.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" } });
  const groupOf = (p: (typeof all)[number]) => (p.sourceConfig as { group?: string } | null)?.group ?? null;
  const profiles = all.filter((p) => !groupOf(p));
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const g = groupOf(p);
    if (g) groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Zoekprofielen</h1>
          <p className="mt-1 text-muted">Definieer wat je zoekt; Deal Hunter controleert automatisch en meldt de beste matches.</p>
        </div>
        <Link href="/profiles/new"><Button><Plus className="h-4 w-4" />Nieuw profiel</Button></Link>
      </div>
      <IphoneMelder exists={groups.has("iPhone")} isAdmin={user!.role === "ADMIN"} />
      {[...groups.entries()].map(([g, list]) => {
        const sorted = [...list].sort((a, b) => Number((b.sourceConfig as { tier?: string }).tier === "high") - Number((a.sourceConfig as { tier?: string }).tier === "high") || Number(a.name.includes("overige")) - Number(b.name.includes("overige")) || a.name.localeCompare(b.name, "nl", { numeric: true }));
        const active = list.filter((p) => p.active).length;
        return (
          <section key={g} className="rounded-[24px] bg-card p-6 shadow-card sm:p-8" aria-label={`Categorie ${g}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight">{g}</h2>
                <p className="mt-0.5 text-sm text-muted">{list.length} profielen (per model) · {active} actief · elk model wordt apart en zo snel mogelijk gecontroleerd; nieuwere modellen vaker.</p>
              </div>
              {user!.role === "ADMIN" && <GroupActions group={g} anyActive={active > 0} />}
            </div>
            <ul className="mt-5 divide-y divide-card-border">
              {sorted.map((p) => {
                const tier = (p.sourceConfig as { tier?: string }).tier;
                return (
                  <li key={p.id}>
                    <Link href={`/profiles/${p.id}`} className="flex items-center gap-3 py-3 transition hover:bg-muted-bg/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted">{p.lastError ? <span className="text-danger">Fout: {p.lastError}</span> : p.lastSuccessAt ? `Laatst gecontroleerd ${timeAgo(p.lastSuccessAt)}` : "Nog niet gecontroleerd"}</span>
                      </span>
                      <span className="tabular hidden text-sm text-muted sm:block">{p.discoveredCount} ontdekt</span>
                      <Badge tone={tier === "high" ? "accent" : "neutral"}>{tier === "high" ? "Vaak" : "Normaal"}</Badge>
                      <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Actief" : "Pauze"}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {profiles.length === 0 && groups.size > 0 ? null : profiles.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title="Nog geen zoekprofielen" description="Maak een profiel zoals ‘iPhone 15 Pro inkoop’ met maximale prijs, minimale winst en afstand." action={<Link href="/profiles/new"><Button>Eerste profiel maken</Button></Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((p) => {
            const a = adapterForOrigin(p.sourceKind);
            return (
              <Card key={p.id} className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight">{p.name}</h2>
                    <p className="mt-0.5 text-sm text-muted">{SOURCE[p.sourceKind]}{p.sourceKind === "SEARCH" && ((p.sourceConfig as { queries?: string[] })?.queries ?? []).length ? ` (“${((p.sourceConfig as { queries?: string[] }).queries ?? []).join("”, “")}”)` : ""} · elke {p.intervalMinutes >= 60 ? `${p.intervalMinutes / 60} uur` : `${p.intervalMinutes} min`}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Actief" : "Gepauzeerd"}</Badge>
                    {p.notifyEnabled && <Badge tone="accent">Meldingen ≥ {p.notifyMinScore}</Badge>}
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
                  <div><dt className="text-xs text-muted">Ontdekt</dt><dd className="tabular text-xl font-semibold">{p.discoveredCount}</dd></div>
                  <div><dt className="text-xs text-muted">Interessant</dt><dd className="tabular text-xl font-semibold text-success">{p.interestingCount}</dd></div>
                  <div><dt className="text-xs text-muted">Laatst gelukt</dt><dd className="mt-1 font-medium" title={formatDate(p.lastSuccessAt)}>{timeAgo(p.lastSuccessAt)}</dd></div>
                </dl>
                {p.lastError && <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">Laatste fout: {p.lastError}</p>}
                <div className="mt-5 border-t border-card-border pt-4">
                  <ProfileActions id={p.id} active={p.active} runnable={!!a} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
