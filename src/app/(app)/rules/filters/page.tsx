import type { Metadata } from "next";
import Link from "next/link";
import { GeneralFiltersEditor } from "@/components/rules/general-filters-editor";
import { getCurrentUser } from "@/lib/auth";
import { getRules } from "@/lib/rules/config";
import { vintedStatus } from "@/lib/vinted-radar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Algemene filters" };

export default async function GeneralFiltersPage() {
  const user = await getCurrentUser();
  const [rules, vinted] = await Promise.all([getRules(), vintedStatus(user!.id)]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Algemene filters</h1>
        <p className="mt-1 text-muted">Eén filtersysteem voor Marktplaats en Vinted: accessoires, winstmarge, batterij, land, bescherming en verkoper. Per model stel je de prijsgrenzen en marge in bij de <Link href="/rules/zoekfilters" className="underline">modellenlijst</Link>; waarom een advertentie wel of niet door is gekomen zie je in het <Link href="/rules/logboek" className="underline">filterlogboek</Link>.</p>
      </div>
      <GeneralFiltersEditor initialRules={rules} vinted={vinted} isAdmin={user?.role === "ADMIN"} />
    </div>
  );
}
