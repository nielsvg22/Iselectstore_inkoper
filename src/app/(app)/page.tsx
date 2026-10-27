import { pickupOnlyKm } from "@/lib/rules/apply";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { formatEuro, timeAgo } from "@/lib/format";
import { getConfig } from "@/lib/settings/store";
import { purchaseStatus } from "@/lib/radar/safety";
import { SaveOpportunity } from "@/components/deal/save-opportunity";
import { AutoRefresh } from "@/components/radar-refresh";
import { drivingWhere, validDriveSeconds, purchasePolicy } from "@/lib/radar/driving";
import { cityScopeWhere, marktplaatsScope } from "@/lib/radar/locality";

export const dynamic = "force-dynamic";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "top" ? "top" : sp.tab === "saved" ? "saved" : "new";
  const cfg = await getConfig();
  const pickupKm = await pickupOnlyKm();
  const base: Prisma.AdvertisementWhereInput = {
    isDemo: cfg.demoMode,
    duplicateOfId: null,
    userState: { not: "IGNORED" },
    AND: [marktplaatsScope([cityScopeWhere(cfg.radar.cityOnly), drivingWhere(cfg), ...(pickupKm != null ? [{ OR: [{ distanceKm: null }, { distanceKm: { lte: pickupKm } }] }] : [])])],
  };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const top = {
    isCurrent: true,
    blocked: false,
    uncertain: false,
    score: { gte: cfg.radar.topMinScore },
    netProfitCents: { gte: cfg.radar.topMinProfitCents },
  };
  const [ads, count, opportunities, average, last] = await Promise.all([
    prisma.advertisement.findMany({
      where: {
        ...base,
        ...(tab === "saved" ? { userState: "FAVORITE" } : {}),
        ...(tab === "top" ? { analyses: { some: top } } : {}),
      },
      orderBy: { firstSeenAt: "desc" },
      take: 60,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        product: { include: { specs: true } },
        analyses: { where: { isCurrent: true }, take: 1 },
        risk: true,
      },
    }),
    prisma.advertisement.count({
      where: { ...base, firstSeenAt: { gte: today } },
    }),
    prisma.dealAnalysis.count({ where: { ...top, ad: base } }),
    prisma.dealAnalysis.aggregate({
      where: {
        isCurrent: true,
        blocked: false,
        uncertain: false,
        netProfitCents: { gt: 0 },
        ad: base,
      },
      _avg: { netProfitCents: true },
    }),
    prisma.searchProfile.findFirst({
      where: { active: true, sourceKind: "SEARCH" },
      orderBy: { lastSuccessAt: { sort: "desc", nulls: "last" } },
      select: { lastSuccessAt: true },
    }),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <AutoRefresh />
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted">
          Live inkoopkansen
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          iSelectStore — Inkoopradar
        </h1>
        <p className="mt-2 text-sm text-muted">
          {cfg.radar.cityOnly ? "Alleen Apeldoorn · geen verzending van buiten" : cfg.policies.distance.mode === "driving" ? `Apeldoorn · maximaal ${cfg.policies.distance.pickupMaxMinutes} min rijden · gecontroleerde verzending erbuiten` : `Apeldoorn · ${cfg.policies.distance.pickupMaxKm} km`} ·{" "}
          {last?.lastSuccessAt
            ? `Laatste succesvolle controle ${timeAgo(last.lastSuccessAt)}`
            : "Wacht op eerste succesvolle controle"}
        </p>
        <Link href="/status" className="mt-2 inline-block text-sm font-medium text-muted underline underline-offset-4">Bronstatus bekijken</Link>
      </header>
      <section aria-label="Kerncijfers" className="grid grid-cols-3 gap-3">
        {[
          ["Nieuw vandaag", String(count)],
          ["Topkansen", String(opportunities)],
          [
            "Gem. verwachte winst",
            average._avg.netProfitCents == null
              ? "Onbekend"
              : formatEuro(average._avg.netProfitCents),
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-card p-4 sm:p-6">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular sm:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </section>
      <div className="flex items-center justify-between border-b border-card-border pb-3">
        <nav aria-label="Dealfeed" className="flex gap-5">
          {[
            ["new", "Nieuw"],
            ["top", "Topdeals"],
            ["saved", "Opgeslagen"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={`/?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              className={`text-sm ${tab === key ? "font-semibold text-foreground" : "text-muted"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link className="text-sm text-muted" href="/deals?sort=new">
          Filters
        </Link>
      </div>
      {cfg.policies.distance.mode === "driving" && <details className="text-xs text-muted"><summary className="cursor-pointer">Rijtijd en verzendvoorwaarden</summary><p className="mt-2">Rijtijd over de weg vanaf centrum Apeldoorn, zonder actuele verkeersinformatie. Advertentielocaties kunnen een plaatscentrum zijn. Buiten het rijgebied: verzending, minimaal {cfg.policies.seller.minReviews} reviews met gemiddeld {cfg.policies.seller.minRating}/5 en een account van {cfg.policies.seller.minAgeMonths} maanden. Onbekende gegevens krijgen geen automatische goedkeuring. Routegegevens: © OpenStreetMap contributors / Geofabrik, OSRM.</p></details>}
      <section aria-label="Live dealfeed" className="space-y-3">
        {!ads.length && (
          <div className="rounded-2xl bg-card p-8 text-center">
            <p className="font-medium">Nog geen kansen in deze selectie</p>
            <p className="mt-2 text-sm text-muted">
              De radar toont echte advertenties zodra de bron nieuwe resultaten
              levert.
            </p>
            <Link
              href="/profiles"
              className="mt-4 inline-block text-sm underline"
            >
              Radar instellen
            </Link>
          </div>
        )}
        {ads.map((ad) => {
          const a = ad.analyses[0];
          const seller = ad.sellerSignals as {
            rating?: number;
            reviewCount?: number;
            accountAgeMonths?: number;
          } | null;
          const status = purchaseStatus(
            {
              distanceKm: ad.distanceKm,
              driveSeconds: validDriveSeconds(ad),
              shipping:
                Boolean(ad.risk) &&
                (ad.shippingOptions as string[]).includes("shipping"),
              rating: seller?.rating,
              reviews: seller?.reviewCount,
              ageMonths: seller?.accountAgeMonths,
              blocked: Boolean(ad.risk?.blocked),
              suspicious:
                ad.risk?.level === "HIGH" ||
                (Array.isArray(ad.risk?.flags) &&
                  ad.risk.flags.some(
                    (f) =>
                      f != null &&
                      typeof f === "object" &&
                      "severity" in f &&
                      (f.severity === "high" || f.severity === "block"),
                  )),
            },
            purchasePolicy(cfg),
          );
          // bewezen te jong account en buiten het ophaalgebied: niet in de radar (verzenden is geen optie)
          if (status.key === "young") return null;
          const storage = ad.product?.specs.find(
            (s) => s.key === "storageGb" && s.source !== "UNKNOWN",
          )?.value;
          return (
            <article
              key={ad.id}
              className="flex gap-4 rounded-2xl border border-card-border bg-card p-4 sm:gap-6 sm:p-5"
            >
              <Link
                href={`/ads/${ad.id}`}
                className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-muted-bg sm:h-32 sm:w-32"
              >
                {ad.images[0] ? (
                  <img
                    src={ad.images[0].url}
                    alt={ad.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-muted">
                    Geen foto
                  </span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link
                    href={`/ads/${ad.id}`}
                    className="font-semibold tracking-tight"
                  >
                    {ad.product?.modelLabel ?? ad.title}
                    {storage ? ` · ${storage} GB` : ""}
                  </Link>
                  <span className="font-semibold tabular">
                    {ad.askingPriceCents == null
                      ? "Prijs onbekend"
                      : formatEuro(ad.askingPriceCents)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {ad.location ?? "Plaats onbekend"} ·{" "}
                  {cfg.policies.distance.mode === "driving" ? (validDriveSeconds(ad) == null ? "Rijtijd onbekend" : `±${Math.ceil(validDriveSeconds(ad)! / 60)} min rijden`) : ad.distanceKm == null ? "Afstand onbekend" : `${ad.distanceKm} km`}{" "}
                  · ontdekt {timeAgo(ad.firstSeenAt)}
                </p>
                <p className="mt-3 text-sm">
                  {a && !a.uncertain && ad.askingPriceCents != null
                    ? `Geschatte nettowinst ${formatEuro(a.netProfitCents)}`
                    : "Winst nog onzeker"}
                </p>
                <p
                  className={`mt-1 text-xs ${status.key === "excluded" ? "text-danger" : "text-muted"}`}
                >
                  {status.label}
                  {!a ? " · Analyse volgt" : ""}
                  {ad.isDemo ? " · Voorbeelddata" : ""}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {!ad.isDemo && (
                    <a
                      href={ad.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-accent-strong"
                    >
                      Bekijk op Marktplaats ↗
                    </a>
                  )}
                  <SaveOpportunity
                    id={ad.id}
                    saved={ad.userState === "FAVORITE"}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
