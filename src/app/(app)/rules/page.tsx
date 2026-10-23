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
        <p className="mt-1 text-muted">Maximale prijs per model op basis van batterij, krassen en afstand, met marge- en verzendregels. Zo bepaalt de app welke advertenties een melding geven. <Link href="/rules/beslisboom" className="underline">Bekijk de beslisboom</Link> of de <Link href="/rules/zoekfilters" className="underline">zoekfilters</Link> en <Link href="/rules/automsg" className="underline">auto-berichten</Link>.</p>
      </div>
      <RulesEditor initialRules={rules} initialPrices={prices} isAdmin={user?.role === "ADMIN"} />
    </div>
  );
}
