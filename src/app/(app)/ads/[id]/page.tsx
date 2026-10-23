import { FunnelOpenBeacon, GoToAdButton } from "@/components/tracked-ad-link";
import { rulesEmoji, rulesLines, type RulesSummary } from "@/lib/notify/message";
import { ArrowLeft, ArrowUpRight, Check, CircleHelp, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdActions } from "@/components/ad/ad-actions";
import { SellerCard } from "@/components/ad/seller-card";
import { AutoEnrich } from "@/components/ad/auto-enrich";
import { CorrectionsForm, CostEditor, NotesEditor } from "@/components/ad/ad-editors";
import { PriceHistoryChart } from "@/components/ad/charts";
import { PhotoAi } from "@/components/ad/photo-ai";
import { getPhotoAnalysis } from "@/lib/ai/photos";
import { BandBadge, RiskBadge, ScoreRing } from "@/components/deal/ui";
import { MaxBid } from "@/components/deal/deal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { hiRes } from "@/lib/images";
import { formatDate, formatEuro, formatPct, timeAgo } from "@/lib/format";
import { getAdDetail } from "@/lib/queries";
import { getConfig } from "@/lib/settings/store";
import type { RiskFlag } from "@/lib/types";
import type { ProfitBreakdown } from "@/lib/engines/profit";
import type { ScoreFactor } from "@/lib/engines/scoring";
import type { SellerAssessment } from "@/lib/engines/seller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analyse" };

const SOURCE_LABEL: Record<string, { label: string; tone: "success" | "neutral" | "accent" | "warning" }> = {
  CONFIRMED: { label: "Vastgesteld", tone: "success" },
  SELLER_CLAIM: { label: "Volgens verkoper", tone: "accent" },
  AI_ESTIMATE: { label: "AI-inschatting", tone: "warning" },
  UNKNOWN: { label: "Onbekend", tone: "neutral" },
};
const KEY_LABEL: Record<string, string> = { storageGb: "Opslag", ramGb: "RAM", color: "Kleur", batteryHealth: "Batterijconditie", chip: "Chip", screenInch: "Schermformaat", cycles: "Batterijcycli", year: "Jaar", connectivity: "Verbinding", sizeMm: "Kastgrootte", activationLock: "iCloud / Activatieslot", simlock: "Simlock", mdm: "MDM", repaired: "Eerder gerepareerd", damage: "Schade" };
const UNIT: Record<string, string> = { storageGb: " GB", ramGb: " GB", batteryHealth: "%", screenInch: '"', sizeMm: " mm" };
const VALUE_LABEL: Record<string, string> = { locked: "Vergrendeld", clear: "Vrij (volgens verkoper)", yes: "Ja", true: "Ja", unknown: "Onbekend", onbekend: "Onbekend" };
const DAMAGE: Record<string, string> = { SCREEN_DAMAGE: "Scherm", BACK_DAMAGE: "Achterkant", CAMERA_DAMAGE: "Camera", WATER_DAMAGE: "Water", SEVERE_DEFECT: "Ernstig defect", COSMETIC_DAMAGE: "Gebruikssporen" };

function ValueRange({ low, expected, high }: { low: number; expected: number; high: number }) {
  const span = Math.max(1, high - low);
  const pos = ((expected - low) / span) * 100;
  return (
    <div>
      <div className="relative mt-5 h-2.5 rounded-full bg-gradient-to-r from-warning-soft via-accent-soft to-success-soft">
        <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-card bg-accent shadow" style={{ left: `${Math.min(97, Math.max(3, pos))}%` }} aria-hidden />
      </div>
      <div className="tabular mt-3 grid grid-cols-3 text-center text-sm">
        <div><p className="text-xs text-muted">Laag</p><p className="font-semibold">{formatEuro(low)}</p></div>
        <div><p className="text-xs text-muted">Verwacht</p><p className="text-lg font-semibold text-accent">{formatEuro(expected)}</p></div>
        <div><p className="text-xs text-muted">Optimistisch</p><p className="font-semibold">{formatEuro(high)}</p></div>
      </div>
    </div>
  );
}

export default async function AdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getAdDetail(id);
  if (!d) notFound();
  const cfg = await getConfig();
  const { ad, current: a, valuations, comparables, similar } = d;
  const costs = a?.costs as unknown as { expected: ProfitBreakdown; conservative: ProfitBreakdown; optimistic: ProfitBreakdown; valuationSteps: string[]; repairCents: number; maxBidConservativeCents: number; seller?: SellerAssessment; distance?: { note: string }; battery?: { notes: string[] }; rules?: RulesSummary } | undefined;
  const flags = (ad.risk?.flags ?? []) as unknown as RiskFlag[];
  const breakdown = a?.scoreBreakdown as unknown as { factors: ScoreFactor[]; adjustments: Array<{ label: string; delta?: number; cap?: number }> } | undefined;
  const priceKnown = ad.askingPriceCents != null && ad.askingPriceCents > 0;
  const specs = ad.product?.specs ?? [];
  const spec = (k: string) => specs.find((s) => s.key === k);
  const ov = (ad.overrides ?? {}) as { costs?: Record<string, number | boolean> };
  const chartData = ad.priceHistory.map((p) => ({ date: p.observedAt.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }), price: p.priceCents / 100 }));
  const images = ad.images.map((i) => i.url);
  const photoAnalysis = ad.isDemo ? null : await getPhotoAnalysis(ad.id);
  const blocked = a?.blocked ?? false;

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" />Alle deals</Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {a && <BandBadge band={a.band} blocked={blocked} />}
            {ad.isDemo && <Badge tone="warning">Voorbeelddata</Badge>}
            {ad.duplicateOfId && <Badge tone="neutral">Mogelijk duplicaat</Badge>}
            {ad.needsManualReview && <Badge tone="warning">Handmatige controle vereist</Badge>}
            {!ad.isDemo && ad.origin === "SEARCH" && !ad.detailFetchedAt && <Badge tone="warning">Voorlopige beoordeling</Badge>}
          </div>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{ad.product?.modelLabel ?? ad.title}</h1>
          <p className="mt-1 text-muted">{ad.title}</p>
          <p className="mt-2 text-sm text-muted">
            {ad.location ?? "Locatie onbekend"}{ad.distanceKm != null ? ` · ${Math.round(ad.distanceKm)} km` : ""} · gevonden {timeAgo(ad.firstSeenAt)}
            {ad.publishedAt ? ` · geplaatst ${formatDate(ad.publishedAt)}` : ""} · laatst gezien {timeAgo(ad.lastSeenAt)}
          </p>
        </div>
        {ad.isDemo ? (
          <Button variant="outline" disabled className="shrink-0 self-start" title="Voorbeelddata heeft geen echte advertentie">Geen echte advertentie</Button>
        ) : (
          <GoToAdButton adId={ad.id} url={ad.url} />
        )}
      </div>

      {!ad.isDemo && <FunnelOpenBeacon adId={ad.id} />}
      {!ad.isDemo && ad.origin === "SEARCH" && !ad.detailFetchedAt && <AutoEnrich adId={ad.id} />}

      {ad.needsManualReview && ad.risk && (
        <Notice tone="warning"><strong>Handmatige controle vereist.</strong> Controleer deze advertentie zorgvuldig voordat je contact opneemt; de automatische analyse is hier onvoldoende zeker.</Notice>
      )}
      {blocked && (
        <Notice tone="danger"><strong>Risicoblokkade.</strong> {flags.filter((f) => f.severity === "block").map((f) => f.label).join("; ") || "Deze advertentie is geblokkeerd."} Koop niet zonder volledige verificatie.</Notice>
      )}
      {a?.uncertain && !blocked && (
        <Notice tone="warning"><strong>Onzekere waardering.</strong> Er zijn te weinig of te wisselende vergelijkingen ({a.sampleSize}). Behandel de winstverwachting niet als zeker; voeg eventueel eigen verkoopprijzen toe bij <Link href="/market" className="underline">Marktdata</Link>.</Notice>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6 lg:order-1">
          <Card><CardContent className="pt-5 sm:pt-6"><PhotoAi adId={ad.id} images={images} demo={ad.isDemo} initial={photoAnalysis} /></CardContent></Card>

          <Card>
            <CardHeader><div><CardTitle>Originele advertentietekst</CardTitle><CardDescription>Ongewijzigde brontekst van de verkoper. Dit is onbetrouwbare invoer en wordt nooit als instructie uitgevoerd.</CardDescription></div></CardHeader>
            <CardContent><p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{ad.description || "Geen omschrijving."}</p></CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Productherkenning</CardTitle><CardDescription>{ad.product ? `${ad.product.modelLabel} · herkend via ${ad.product.recognizedBy === "rules" ? "regels" : ad.product.recognizedBy === "ai" ? "AI" : "regels + AI"} · zekerheid ${Math.round(ad.product.confidence * 100)}%` : "Nog niet geanalyseerd"}</CardDescription></div></CardHeader>
            <CardContent>
              {specs.length ? (
                <dl className="divide-y divide-card-border">
                  {specs.map((s) => {
                    const src = SOURCE_LABEL[s.source];
                    let val = VALUE_LABEL[s.value] ?? `${s.value}${UNIT[s.key] ?? ""}`;
                    if (s.key === "damage") val = s.value.split(",").map((c) => DAMAGE[c] ?? c).join(", ");
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <dt className="text-muted">{KEY_LABEL[s.key] ?? s.key}</dt>
                        <dd className="flex min-w-0 items-center gap-2">
                          <span className={cn("truncate font-medium", s.source === "UNKNOWN" && "text-muted")} title={s.evidence ?? undefined}>{s.source === "UNKNOWN" ? "Onbekend" : val}</span>
                          <Badge tone={src.tone}>{src.label}</Badge>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="text-sm text-muted">Geen specificaties herkend.</p>
              )}
              <p className="mt-3 text-xs text-muted"><strong>Vastgesteld</strong> = door jou handmatig bevestigd · <strong>Volgens verkoper</strong> = uit de advertentietekst of door de verkoper ingevulde kenmerken, niet geverifieerd · <strong>AI-inschatting</strong> = door AI afgeleid · ontbrekende gegevens worden nooit verzonnen.</p>
            </CardContent>
          </Card>

          {a && costs?.rules && costs.rules.status !== "skip" && (
            <Card>
              <CardHeader><div><CardTitle>Inkoopregels {rulesEmoji(costs.rules)}</CardTitle><CardDescription>Maximale prijs volgens de Best Buy Phone-regels.</CardDescription></div><Badge tone={costs.rules.status === "reject" ? "danger" : costs.rules.status === "review" ? "warning" : "success"}>{{ high: "💰 Hoge marge", match: "Voldoet", review: "Handmatig controleren", reject: "Afgewezen" }[costs.rules.status as string]}</Badge></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {costs.rules.reasons.length > 0 && <ul className="list-disc pl-5">{costs.rules.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                {costs.rules.lines.length > 0 && <table className="w-full max-w-md"><tbody>{costs.rules.lines.map((l, i) => <tr key={i}><td className="py-0.5 pr-3">{i === 0 ? "" : l.euro < 0 ? "− " : "+ "}{l.label}</td><td className="text-right tabular-nums">€{Math.abs(l.euro)}</td></tr>)}</tbody></table>}
                {rulesLines(costs.rules).map((l) => <p key={l}>{l}</p>)}
                <p><Link href={`/rules/beslisboom?ad=${ad.id}`} className="underline">Bekijk de beslisboom voor deze advertentie</Link></p>
                {costs.rules.notes.length > 0 && <ul className="list-disc pl-5 text-muted">{costs.rules.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </CardContent>
            </Card>
          )}
          {a && costs && (
            <Card>
              <CardHeader><div><CardTitle>Winstberekening</CardTitle><CardDescription>Transparant: elke post die meetelt. Alle bedragen zijn schattingen, geen garantie.</CardDescription></div></CardHeader>
              <CardContent className="space-y-5">
                <div className="overflow-x-auto">
                  <table className="tabular w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-muted">
                        <th className="pb-2 text-left font-medium">Post</th>
                        <th className="pb-2 text-right font-medium">Conservatief</th>
                        <th className="pb-2 text-right font-medium">Verwacht</th>
                        <th className="pb-2 text-right font-medium">Optimistisch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {costs.expected.lines.map((l, i) => (
                        <tr key={l.label}>
                          <td className="py-2">{l.label}</td>
                          {[costs.conservative, costs.expected, costs.optimistic].map((p, k) => (
                            <td key={k} className={cn("py-2 text-right", (p.lines[i]?.cents ?? 0) < 0 ? "text-foreground/80" : "")}>{p.lines[i] ? formatEuro(p.lines[i].cents) : "—"}</td>
                          ))}
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="pt-3">Netto winst (vóór belasting)</td>
                        {[costs.conservative, costs.expected, costs.optimistic].map((p, k) => (
                          <td key={k} className={cn("pt-3 text-right", p.netProfitCents >= 0 ? "text-success" : "text-danger")}>{priceKnown ? formatEuro(p.netProfitCents) : "—"}</td>
                        ))}
                      </tr>
                      <tr className="text-muted">
                        <td className="py-1.5">Brutomarge</td>
                        {[costs.conservative, costs.expected, costs.optimistic].map((p, k) => (<td key={k} className="py-1.5 text-right">{priceKnown ? formatPct(p.grossMarginPct) : "—"}</td>))}
                      </tr>
                      <tr className="text-muted">
                        <td className="py-1.5">Nettomarge</td>
                        {[costs.conservative, costs.expected, costs.optimistic].map((p, k) => (<td key={k} className="py-1.5 text-right">{priceKnown ? formatPct(p.netMarginPct) : "—"}</td>))}
                      </tr>
                      <tr className="text-muted">
                        <td className="py-1.5">Rendement op inkoop</td>
                        {[costs.conservative, costs.expected, costs.optimistic].map((p, k) => (<td key={k} className="py-1.5 text-right">{priceKnown ? formatPct(p.roiPct) : "—"}</td>))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-muted-bg p-4"><p className="text-xs text-muted">Minimale verkoopprijs</p><p className="tabular mt-1 text-lg font-semibold">{priceKnown ? formatEuro(a.minSalePriceCents) : "—"}</p><p className="mt-0.5 text-xs text-muted">voor je winstdoel van {formatEuro(cfg.targets.minProfitCents)}</p></div>
                  <div className="rounded-2xl bg-accent-soft p-4"><p className="text-xs text-muted">Max. inkoop (verwacht)</p><p className="tabular mt-1 text-lg font-semibold text-accent">{formatEuro(a.maxBidCents)}</p><p className="mt-0.5 text-xs text-muted">≥ {formatEuro(cfg.targets.minProfitCents)} winst én ≥ {cfg.targets.minRoiPct}% rendement</p></div>
                  <div className="rounded-2xl bg-muted-bg p-4"><p className="text-xs text-muted">Max. inkoop (conservatief)</p><p className="tabular mt-1 text-lg font-semibold">{formatEuro(costs.maxBidConservativeCents)}</p><p className="mt-0.5 text-xs text-muted">als de verkoop tegenvalt</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {a && (
            <Card>
              <CardHeader><div><CardTitle>Marktwaardeschatting</CardTitle><CardDescription>{a.sampleSize} vergelijkbare producten · betrouwbaarheid {Math.round(a.valuationConfidence * 100)}%{valuations.length ? ` · berekend ${formatDate(valuations[valuations.length - 1].computedAt)}` : ""}</CardDescription></div>{a.uncertain && <Badge tone="warning">Onzeker</Badge>}</CardHeader>
              <CardContent>
                {a.expectedCents > 0 ? <ValueRange low={a.lowCents} expected={a.expectedCents} high={a.highCents} /> : <p className="text-sm text-muted">Geen marktwaarde te bepalen: er is nog geen vergelijkbare data voor dit model.</p>}
                {costs?.valuationSteps?.length ? (
                  <details className="mt-5 rounded-2xl bg-muted-bg px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-medium">Hoe is dit berekend?</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">{costs.valuationSteps.map((s, i) => (<li key={i}>{s}</li>))}</ul>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><div><CardTitle>Vergelijkbare advertenties &amp; prijzen</CardTitle><CardDescription>Dezelfde modelvariant in de database. Vraagprijzen zijn geen verkoopprijzen.</CardDescription></div></CardHeader>
            <CardContent>
              {similar.length > 0 && (
                <ul className="mb-5 grid gap-2 sm:grid-cols-2">
                  {similar.map((s) => (
                    <li key={s.id}>
                      <Link href={`/ads/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-card-border p-2.5 transition hover:bg-muted-bg">
                        {s.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={hiRes(s.images[0].url, "thumb")} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <span className="h-12 w-16 rounded-lg bg-muted-bg" />}
                        <span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm font-medium">{s.title}</span><span className="tabular text-xs text-muted">{formatEuro(s.askingPriceCents)}{s.analyses[0] ? ` · score ${s.analyses[0].score}` : ""}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {comparables.length ? (
                <div className="overflow-x-auto">
                  <table className="tabular w-full min-w-[420px] text-sm">
                    <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="pb-2 font-medium">Soort</th><th className="pb-2 font-medium">Opslag</th><th className="pb-2 text-right font-medium">Prijs</th><th className="pb-2 text-right font-medium">Datum</th></tr></thead>
                    <tbody className="divide-y divide-card-border">
                      {comparables.slice(0, 12).map((c) => (
                        <tr key={c.id}>
                          <td className="py-2"><Badge tone={c.kind === "REALIZED" ? "success" : "neutral"}>{c.kind === "REALIZED" ? "Gerealiseerd" : c.kind === "ASKING_CURRENT" ? "Vraagprijs" : "Hist. vraagprijs"}</Badge></td>
                          <td className="py-2 text-muted">{c.storageGb ? `${c.storageGb} GB` : "—"}</td>
                          <td className="py-2 text-right font-medium">{formatEuro(c.priceCents)}</td>
                          <td className="py-2 text-right text-muted">{c.observedAt.toLocaleDateString("nl-NL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">Geen vergelijkingsdata voor dit model.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Prijshistorie</CardTitle></CardHeader>
            <CardContent><PriceHistoryChart data={chartData} /></CardContent>
          </Card>

          <SellerCard seller={costs?.seller ?? null} notes={[...(costs?.distance?.note ? [costs.distance.note] : []), ...(costs?.battery?.notes ?? [])]} />

          <Card id="kosten">
            <CardHeader><div><CardTitle>Kosten bewerken</CardTitle><CardDescription>Laat leeg om de standaardwaarden uit de instellingen te gebruiken{costs ? `. Automatisch geschatte reparatiekosten: ${formatEuro(costs.repairCents)}` : ""}.</CardDescription></div></CardHeader>
            <CardContent>
              <CostEditor
                adId={ad.id}
                overrides={ov.costs ?? {}}
                defaults={{ repair: costs?.repairCents ?? 0, shipping: cfg.costs.shippingCents, transport: cfg.costs.transportCents, other: cfg.costs.otherCents, marginSchemeEligible: cfg.tax.marginSchemeEligible, vatMode: cfg.tax.vatMode }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Handmatige correcties</CardTitle><CardDescription>Klopt de herkenning niet? Corrigeer hier; de analyse wordt direct herberekend.</CardDescription></div></CardHeader>
            <CardContent>
              <CorrectionsForm
                adId={ad.id}
                current={{ modelKey: ad.product?.modelKey ?? "", storageGb: spec("storageGb") && spec("storageGb")!.source !== "UNKNOWN" ? Number(spec("storageGb")!.value) : null, ramGb: spec("ramGb") && spec("ramGb")!.source !== "UNKNOWN" ? Number(spec("ramGb")!.value) : null, batteryHealth: spec("batteryHealth") && spec("batteryHealth")!.source !== "UNKNOWN" ? Number(spec("batteryHealth")!.value) : null, color: spec("color")?.value ?? null }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notities</CardTitle></CardHeader>
            <CardContent><NotesEditor adId={ad.id} initial={ad.notes} /></CardContent>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start lg:order-2">
          {a ? (
            <Card className="overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <ScoreRing score={a.score} size={84} blocked={blocked} />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted">Dealscore</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><BandBadge band={a.band} blocked={blocked} /><RiskBadge level={ad.risk?.level ?? null} /></div>
                  </div>
                </div>
                <dl className="tabular mt-6 grid grid-cols-2 gap-x-4 gap-y-4">
                  <div><dt className="text-xs text-muted">Vraagprijs</dt><dd className="text-xl font-semibold">{priceKnown ? formatEuro(ad.askingPriceCents) : "Bieden"}</dd></div>
                  <div><dt className="text-xs text-muted">Marktwaarde{a.uncertain ? " (onzeker)" : ""}</dt><dd className="text-xl font-semibold">{a.expectedCents ? formatEuro(a.expectedCents) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Verwachte winst</dt><dd className={cn("text-xl font-semibold", priceKnown && (a.netProfitCents > 0 ? "text-success" : "text-danger"))}>{priceKnown ? formatEuro(a.netProfitCents) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Rendement</dt><dd className="text-xl font-semibold">{priceKnown ? formatPct(a.roiPct, 0) : "—"}</dd></div>
                </dl>
                <div className="mt-5 rounded-2xl bg-accent-soft p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">Maximaal bod</p>
                  <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{a.maxBidCents > 0 ? formatEuro(a.maxBidCents) : "—"}</p>
                  <p className="mt-1 text-sm"><MaxBid d={{ askingCents: a.askingCents, maxBidCents: a.maxBidCents, priceKnown }} /></p>
                  <p className="mt-2 text-xs text-muted">Bij deze inkoopprijs haal je je winstdoel én rendementsdoel op de verwachte verkoopprijs.</p>
                </div>
              </CardContent>
              <div className="border-t border-card-border p-5 sm:p-6">
                <AdActions adId={ad.id} url={ad.url} isDemo={ad.isDemo} userState={ad.userState} purchased={!!ad.purchase} askingCents={ad.askingPriceCents} />
              </div>
            </Card>
          ) : (
            <Card><CardContent className="pt-6"><p className="text-sm text-muted">Deze advertentie is nog niet geanalyseerd.</p><div className="mt-4"><AdActions adId={ad.id} url={ad.url} isDemo={ad.isDemo} userState={ad.userState} purchased={!!ad.purchase} askingCents={ad.askingPriceCents} /></div></CardContent></Card>
          )}

          {a && (
            <Card>
              <CardHeader><div><CardTitle>Uitleg van de score</CardTitle></div></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-foreground/85">{a.explanation}</p>
                {breakdown?.factors && (
                  <ul className="space-y-3">
                    {breakdown.factors.map((f) => (
                      <li key={f.key}>
                        <div className="flex justify-between text-xs"><span>{f.label}</span><span className="tabular text-muted">{f.points.toFixed(0)} / {(f.weight * 100 / breakdown.factors.reduce((x, y) => x + y.weight, 0)).toFixed(0)} pt</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted-bg"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(f.value * 100)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><div><CardTitle>Risicoanalyse</CardTitle><CardDescription>Op basis van de advertentietekst; geen verificatie.</CardDescription></div></CardHeader>
            <CardContent>
              {flags.length ? (
                <ul className="space-y-2.5">
                  {flags.map((f, i) => {
                    const Icon = f.severity === "block" ? ShieldAlert : f.severity === "info" ? CircleHelp : TriangleAlert;
                    return (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", f.severity === "block" || f.severity === "high" ? "text-danger" : f.severity === "warn" ? "text-warning" : "text-muted")} />
                        <span><span className="font-medium">{f.label}</span>{f.evidence && <span className="block text-xs text-muted">“{f.evidence}”</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success"><ShieldCheck className="h-4 w-4" />Geen risicosignalen gevonden in de tekst.</p>
              )}
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Check className="h-3 w-3" />Controleer altijd serienummer/IMEI, iCloud-status en eigendom bij overdracht.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
