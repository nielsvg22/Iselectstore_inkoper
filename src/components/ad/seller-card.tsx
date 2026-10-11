import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVENANCE_LABEL, type SellerAssessment } from "@/lib/engines/seller";

const LEVEL: Record<SellerAssessment["level"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  HIGH: { label: "Voldoende onderbouwd", tone: "success" },
  MEDIUM: { label: "Matig onderbouwd", tone: "warning" },
  LOW: { label: "Laag / risicosignalen", tone: "danger" },
  UNKNOWN: { label: "Onvoldoende gegevens", tone: "neutral" },
};

/** Uitlegbare verkopersbetrouwbaarheid: elk signaal met herkomst; onbekend wordt nooit als betrouwbaar geteld. */
export function SellerCard({ seller, notes }: { seller: SellerAssessment | null; notes: string[] }) {
  if (!seller) return null;
  const lv = LEVEL[seller.level];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Betrouwbaarheid verkoper</CardTitle>
          <CardDescription>Op basis van verifieerbare signalen. Dit is een hulpmiddel, geen garantie — controleer altijd zelf.</CardDescription>
        </div>
        <div className="flex items-center gap-2"><Badge tone={lv.tone}>{lv.label}</Badge><span className="tabular text-sm text-muted">{seller.score}/100</span></div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-card-border">
          {seller.signals.map((s) => (
            <li key={s.code} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <span>{s.label}{s.detail && <span className="block text-xs text-muted">{s.detail}</span>}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-muted-bg px-2 py-0.5 text-[11px] text-muted">{PROVENANCE_LABEL[s.provenance]}</span>
                <span className={`tabular w-9 text-right font-medium ${s.effect > 0 ? "text-success" : s.effect < 0 ? "text-danger" : "text-faint"}`}>{s.effect > 0 ? "+" : ""}{s.effect}</span>
              </span>
            </li>
          ))}
          {seller.unknown.map((u) => (
            <li key={u} className="flex items-center justify-between gap-3 py-2.5 text-sm text-muted">
              <span>{u}</span>
              <span className="rounded-full bg-muted-bg px-2 py-0.5 text-[11px]">{PROVENANCE_LABEL.UNKNOWN}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{seller.summary} Marktplaats levert in zoekresultaten geen beoordelingen, accountleeftijd of verkoopverleden; die gegevens tellen daarom nooit mee als positief.</p>
        {notes.length > 0 && <ul className="space-y-1 border-t border-card-border pt-3 text-xs text-muted">{notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
      </CardContent>
    </Card>
  );
}
