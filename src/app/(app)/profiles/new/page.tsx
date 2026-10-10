import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import type { Group } from "@/lib/engines/filters";
import { defaultProfile } from "@/lib/profile-form";
import { getAppleCategories } from "@/lib/sources/category-discovery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuw zoekprofiel" };

export default async function NewProfilePage() {
  const user = await getCurrentUser();
  const [saved, cats] = await Promise.all([prisma.savedFilter.findMany({ where: { userId: user!.id }, orderBy: { name: "asc" } }), getAppleCategories()]);
  const base = defaultProfile();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-[32px] font-semibold tracking-tight">Nieuw zoekprofiel</h1>
      <ProfileEditor
        initial={{ ...base, name: "iPhone 15 Pro inkoop", queries: ["iphone 15 pro"], category: "telecommunicatie/mobiele-telefoons-apple-iphone" }}
        savedFilters={saved.map((f) => ({ id: f.id, name: f.name, tree: f.tree as unknown as Group }))}
        categories={cats.categories}
      />
    </div>
  );
}
