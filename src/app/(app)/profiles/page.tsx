import { RadarBackups } from "@/components/profile/radar-backups";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Search } from "lucide-react";
import { ApeldoornRadarSetup } from "@/components/profile/apeldoorn-radar";
import { ProfileActions } from "@/components/profile/profile-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { timeAgo } from "@/lib/format";
import { APELDOORN_RADAR_NAME } from "@/lib/radar/apeldoorn";
import { adapterForOrigin } from "@/lib/sources/adapters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inkoopradar" };

export default async function ProfilesPage() {
  const user = await getCurrentUser();
  const allProfiles = await prisma.searchProfile.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
  });
  const profiles = allProfiles.filter((p) => p.active);
  const paused = allProfiles.filter((p) => !p.active);
  const radar = profiles.some(
    (p) => p.name === APELDOORN_RADAR_NAME && p.active,
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            iSelectStore · Deal Hunter
          </p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-tight">
            Zoekopdrachten
          </h1>
          <p className="mt-1 text-sm text-muted">
            Alle kansen op één plek, zonder tientallen profielen op het scherm.
          </p>
        </div>
        <Link href="/profiles/new">
          <Button variant="outline">
            <Search className="h-4 w-4" />
            Eigen zoekopdracht
          </Button>
        </Link>
      </header>
      <ApeldoornRadarSetup
        active={radar}
        profileCount={profiles.length}
        isAdmin={user!.role === "ADMIN"}
      />
      <Card className="p-5 sm:p-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Actieve zoekopdrachten</h2>
          <span className="text-sm text-muted">
            {profiles.filter((p) => p.active).length} actief
          </span>
        </div>
        {!profiles.length ? (
          <p className="py-6 text-sm text-muted">
            Nog geen zoekopdrachten. Activeer de Apeldoorn-radar om te beginnen.
          </p>
        ) : (
          <div className="divide-y divide-card-border">
            {profiles.slice(0, 8).map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/profiles/${p.id}`}
                    className="inline-flex max-w-full items-center gap-2 font-semibold hover:text-accent"
                  >
                    <span className="truncate">{p.name}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0" />
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    {p.lastError
                      ? `Fout: ${p.lastError}`
                      : p.lastSuccessAt
                        ? `Laatst gecontroleerd ${timeAgo(p.lastSuccessAt)}`
                        : "Wacht op eerste controle"}
                    {" · "}
                    {p.discoveredCount} gevonden
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={p.active ? "success" : "neutral"}>
                    {p.active ? "Actief" : "Gepauzeerd"}
                  </Badge>
                  <ProfileActions
                    id={p.id}
                    active={p.active}
                    runnable={!!adapterForOrigin(p.sourceKind)}
                  />
                </div>
              </div>
            ))}
            {profiles.length > 8 && (
              <p className="pt-4 text-sm text-muted">
                Nog {profiles.length - 8} bestaande profielen. Met ‘Gebruik dit
                profiel’ vervang je ze allemaal na bevestiging.
              </p>
            )}
          </div>
        )}
      </Card>
      {paused.length > 0 && (
        <details className="rounded-2xl border border-card-border p-5">
          <summary className="cursor-pointer text-sm text-muted">
            Gepauzeerde en gearchiveerde profielen ({paused.length})
          </summary>
          <div className="mt-3 space-y-3">
            {paused.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <Link href={`/profiles/${p.id}`} className="text-sm">
                  {p.name}
                </Link>
                <ProfileActions id={p.id} active={false} runnable={false} />
              </div>
            ))}
          </div>
        </details>
      )}
      {user!.role === "ADMIN" && <RadarBackups />}
    </div>
  );
}
