import type { Metadata } from "next";
import Link from "next/link";
import { FiltersEditor } from "@/components/rules/filters-editor";
import { getCurrentUser } from "@/lib/auth";
import { getRules } from "@/lib/rules/config";
import { getFilters } from "@/lib/rules/filters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Zoekfilters" };

export default async function FiltersPage() {
  const [user, rules, filters] = await Promise.all([getCurrentUser(), getRules(), getFilters()]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Zoekfilters</h1>
        <p className="mt-1 text-muted">De lijst met zoekfilters van de klant: per model, opslag en conditie de prijsgrenzen, afstand, type advertentie en hoe lang de verkoper actief moet zijn. <Link href="/rules" className="underline">Terug naar Inkoopregels</Link>.</p>
      </div>
      <FiltersEditor initialFilters={filters} initialRules={rules} isAdmin={user?.role === "ADMIN"} />
    </div>
  );
}
