import type { Metadata } from "next";
import Link from "next/link";
import { VintedPanel } from "@/components/vinted/vinted-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { hiRes } from "@/lib/images";
import { latestVintedAds } from "@/lib/vinted-feed";
import { vintedStatus } from "@/lib/vinted-radar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vinted" };

const STATUS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  high: { label: "💰 Hoge marge", tone: "success" }, match: { label: "Doorgelaten", tone: "success" }, review: { label: "Controleren", tone: "warning" },
  reject: { label: "Uitgesloten", tone: "danger" }, skip: { label: "Geen oordeel", tone: "neutral" },
};
const age = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} uur`;
};

export default async function VintedPage() {
  const user = await getCurrentUser();
  const [status, ads] = await Promise.all([vintedStatus(user!.id), latestVintedAds(60)]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Vinted</h1>
        <p className="mt-1 text-muted">Nieuwe Vinted-advertenties uit heel Nederland, met dezelfde filters als Marktplaats. <Link href="/deals?platform=vinted" className="underline">Alle Vinted-deals</Link> · <Link href="/rules/logboek?platform=vinted" className="underline">Filterlogboek</Link> · <Link href="/rules/filters" className="underline">Algemene filters</Link>.</p>
      </div>
      <Card>
        <CardHeader><div><CardTitle>Radar</CardTitle><CardDescription>Alleen openbare pagina&apos;s van vinted.nl, met eigen requestlimiet en pauze bij een blokkade. Niet beschikbaar op Vinted: afstand en locatie, accountleeftijd en land van de verkoper.</CardDescription></div></CardHeader>
        <CardContent><VintedPanel initial={status} isAdmin={user?.role === "ADMIN"} /></CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Laatst gevonden ({ads.length})</CardTitle><CardDescription>Nieuwste eerst. &quot;Gevonden&quot; is het moment waarop de app de advertentie voor het eerst zag; de plaatsingstijd geeft Vinted alleen bij benadering.</CardDescription></div></CardHeader>
        <CardContent>
          {ads.length === 0 ? <p className="text-sm text-muted">Nog geen Vinted-advertenties. Zet Vinted aan en maak het zoekprofiel aan; de eerste controle is de nulmeting en geeft geen meldingen.</p> : (
            <ul className="divide-y divide-card-border">
              {ads.map((a) => {
                const st = STATUS[a.status] ?? { label: a.status, tone: "neutral" as const };
                return (
                  <li key={a.id} className="flex gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.image ? <img src={hiRes(a.image, "thumb")} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" /> : <span className="h-16 w-16 shrink-0 rounded-xl bg-muted-bg" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/ads/${a.id}`} className="truncate font-medium hover:underline">{a.title}</Link>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {a.notified > 0 && <Badge tone="accent">Gemeld</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{a.priceEuro != null ? `€${a.priceEuro}` : "prijs onbekend"}{a.model ? ` · ${a.model}` : ""} · gevonden {age(a.seenAt)} geleden{a.detectedAfterSec != null ? ` (±${a.detectedAfterSec} s na plaatsing)` : ""}{a.detailLoaded ? "" : " · details volgen"}</p>
                      {a.reason && <p className="mt-0.5 text-xs text-muted">{a.reason}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
