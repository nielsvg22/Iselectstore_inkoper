import type { Metadata } from "next";
import Link from "next/link";
import { FiltersEditor } from "@/components/rules/filters-editor";
import { getCurrentUser } from "@/lib/auth";
import { getRules } from "@/lib/rules/config";
import { getFilters } from "@/lib/rules/filters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modellenlijst" };

export default async function FiltersPage() {
  const [user, rules, filters] = await Promise.all([getCurrentUser(), getRules(), getFilters()]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Modellenlijst</h1>
        <p className="mt-1 text-muted">De Apple-modellen die de klant wil inkopen (merk Apple, per categorie): per model en opslag de minimum- en maximumprijs, maximale afstand, type advertentie, verwachte doorverkoopprijs en gewenste winstmarge. Dezelfde lijst geldt voor Marktplaats en Vinted. Zet een model op inactief om het tijdelijk over te slaan. <Link href="/rules" className="underline">Terug naar Inkoopregels</Link>.</p>
      </div>
      <FiltersEditor initialFilters={filters} initialRules={rules} isAdmin={user?.role === "ADMIN"} />
    </div>
  );
}
