import { BellRing } from "lucide-react";
import Link from "next/link";
import { Thumb } from "@/components/dashboard/parts";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db/client";
import { formatEuro, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { SENT: "Verzonden", PENDING: "In wachtrij", FAILED: "Mislukt", SKIPPED: "Overgeslagen" };

export default async function NotificationsPage() {
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { ad: { select: { id: true, title: true, askingPriceCents: true, product: { select: { family: true, modelLabel: true } }, images: { take: 1, orderBy: { position: "asc" }, select: { url: true } } } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] font-bold tracking-tight sm:text-[36px]">Meldingen</h1>
        <p className="mt-1 text-muted">Alle verstuurde en geplande Telegram-/Discord-meldingen. Kanalen stel je in bij <Link href="/settings" className="font-semibold text-accent-strong hover:underline">Instellingen</Link>.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<BellRing className="h-6 w-6" />} title="Nog geen meldingen" description="Zodra een deal boven je meldingsdrempel scoort, verschijnt die hier en ontvang je een bericht." />
      ) : (
        <ul className="divide-y divide-card-border rounded-[24px] bg-card p-2 shadow-card">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={`/ads/${n.adId}`} className="flex items-center gap-4 rounded-2xl px-3 py-3 transition hover:bg-muted-bg/60">
                <Thumb image={n.ad.images[0]?.url ?? null} family={n.ad.product?.family ?? null} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-semibold">{n.ad.product?.modelLabel ?? n.ad.title}</span>
                  <span className="tabular text-sm text-muted">{formatEuro(n.ad.askingPriceCents)} · {n.channel === "TELEGRAM" ? "Telegram" : "Discord"}</span>
                </span>
                <span className="text-right text-sm text-muted">
                  <span className="block font-medium text-foreground">{STATUS[n.status] ?? n.status}</span>
                  {timeAgo(n.sentAt ?? n.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
