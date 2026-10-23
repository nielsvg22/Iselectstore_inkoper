import type { Metadata } from "next";
import Link from "next/link";
import { RulesEditor } from "@/components/rules/rules-editor";
import { getCurrentUser } from "@/lib/auth";
import { getBasePrices, getRules } from "@/lib/rules/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inkoopregels" };

export default async function RulesPage() {
  const [user, rules, prices] = await Promise.all([getCurrentUser(), getRules(), getBasePrices()]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Inkoopregels</h1>
        <p className="mt-1 text-muted">Maximale prijs per model op basis van batterij, krassen en afstand, met marge- en verzendregels. Zo bepaalt de app welke advertenties een melding geven.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/rules/zoekfilters" className="rounded-full border border-card-border px-4 py-2 text-sm font-medium hover:bg-muted-bg">Zoekfilters (lijst van de klant)</Link>
          <Link href="/rules/automsg" className="rounded-full border border-card-border px-4 py-2 text-sm font-medium hover:bg-muted-bg">Auto-berichten</Link>
          <Link href="/rules/beslisboom" className="rounded-full border border-card-border px-4 py-2 text-sm font-medium hover:bg-muted-bg">Beslisboom</Link>
        </div>
      </div>
      <RulesEditor initialRules={rules} initialPrices={prices} isAdmin={user?.role === "ADMIN"} />
    </div>
  );
}
