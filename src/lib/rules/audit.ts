import { prisma } from "@/lib/db/client";
import { evaluateAdById } from "./apply";
import { STEPS } from "./steps";
import type { VerdictStatus } from "./verdict";

export interface AuditRow {
  purchaseId: string;
  mNumber: string | null;
  title: string;
  adId: string | null;
  boughtAt: string | null;
  paidEuro: number | null;
  askEuro: number | null;
  /** oordeel van de huidige regels */
  status: VerdictStatus | "unknown";
  /** oordeel dat bij de analyse is opgeslagen (wat er toen is gemeld) */
  storedStatus: VerdictStatus | "unknown";
  decidedBy: string | null;
  reason: string | null;
}

export interface PurchaseAudit {
  total: number;
  /** aantal per oordeel van de huidige regels */
  counts: Record<VerdictStatus | "unknown", number>;
  /** gekocht, maar de app heeft deze advertentie nooit gezien */
  notSeen: number;
  /** aandeel gekochte advertenties dat 💰 had (van de advertenties die de app kende) */
  highSharePct: number | null;
  /** welke stap wees gekochte advertenties af of liet ze controleren: de regel die waarschijnlijk te streng is */
  strictest: Array<{ step: string; title: string; n: number }>;
  rows: AuditRow[];
}

/**
 * Vergelijkt wat jullie echt hebben ingekocht (M-nummers) met het oordeel van de regels.
 * Gekochte advertenties zonder 💰 laten zien welke regel te streng is of welke gegevens ontbreken.
 */
export async function purchaseAudit(userId: string | null, days: number, now = new Date()): Promise<PurchaseAudit> {
  const since = new Date(now.getTime() - days * 86400_000);
  const purchases = await prisma.purchase.findMany({
    where: { status: { in: ["BOUGHT", "LISTED", "SOLD"] }, ...(userId ? { userId } : {}), OR: [{ boughtAt: { gte: since } }, { boughtAt: null, createdAt: { gte: since } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { ad: { select: { id: true, title: true, askingPriceCents: true, externalId: true, analyses: { where: { isCurrent: true }, take: 1, select: { costs: true } } } } },
  });
  const counts: PurchaseAudit["counts"] = { skip: 0, reject: 0, review: 0, match: 0, high: 0, unknown: 0 };
  const strict = new Map<string, number>();
  const rows: AuditRow[] = [];
  let notSeen = 0;
  for (const p of purchases) {
    const ad = p.ad ?? (p.mNumber ? await prisma.advertisement.findFirst({ where: { externalId: p.mNumber }, select: { id: true, title: true, askingPriceCents: true, externalId: true, analyses: { where: { isCurrent: true }, take: 1, select: { costs: true } } } }) : null);
    const stored = ((ad?.analyses[0]?.costs as { rules?: { status?: VerdictStatus } } | null)?.rules?.status ?? "unknown") as AuditRow["storedStatus"];
    const cur = ad ? await evaluateAdById(ad.id) : null;
    if (!ad) notSeen++;
    const status: AuditRow["status"] = cur?.verdict.status ?? "unknown";
    counts[status]++;
    const decided = cur?.verdict.decidedBy ?? null;
    if (decided && (status === "reject" || status === "review" || status === "skip")) strict.set(decided, (strict.get(decided) ?? 0) + 1);
    rows.push({
      purchaseId: p.id, mNumber: p.mNumber, title: ad?.title ?? p.title, adId: ad?.id ?? null, boughtAt: p.boughtAt?.toISOString() ?? null,
      paidEuro: p.buyPriceCents != null ? p.buyPriceCents / 100 : null, askEuro: ad?.askingPriceCents != null ? ad.askingPriceCents / 100 : p.askingCents != null ? p.askingCents / 100 : null,
      status, storedStatus: stored, decidedBy: decided, reason: cur?.verdict.reasons[0] ?? cur?.verdict.notes[0] ?? (ad ? null : "De app heeft deze advertentie nooit gezien (niet gevonden door het zoeken)"),
    });
  }
  const known = purchases.length - notSeen;
  return {
    total: purchases.length, counts, notSeen,
    highSharePct: known ? Math.round((counts.high / known) * 100) : null,
    strictest: [...strict.entries()].sort((a, b) => b[1] - a[1]).map(([step, n]) => ({ step, title: STEPS.find((s) => s.id === step)?.title ?? step, n })),
    rows,
  };
}
