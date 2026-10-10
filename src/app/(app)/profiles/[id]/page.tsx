import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileEditor } from "@/components/profile/profile-editor";
import type { Group } from "@/lib/engines/filters";
import { getAppleCategories } from "@/lib/sources/category-discovery";
import type { ProfileFormValue } from "@/lib/profile-form";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { loadTree } from "@/lib/pipeline/tree";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Zoekprofiel bewerken" };

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const [p, saved, cats] = await Promise.all([prisma.searchProfile.findUnique({ where: { id } }), prisma.savedFilter.findMany({ where: { userId: user!.id }, orderBy: { name: "asc" } }), getAppleCategories()]);
  if (!p || p.userId !== user!.id) notFound();
  const cfg = (p.sourceConfig ?? {}) as { urls?: string[]; feedUrl?: string; queries?: string[]; category?: string; maxPages?: number; fetchDetails?: boolean };
  const value: ProfileFormValue = {
    id: p.id,
    name: p.name,
    active: p.active,
    sourceKind: (["SEARCH", "MANUAL_URL", "FEED", "DEMO"].includes(p.sourceKind) ? p.sourceKind : "MANUAL_URL") as ProfileFormValue["sourceKind"],
    queries: cfg.queries ?? [],
    category: cfg.category ?? "",
    maxPages: cfg.maxPages ?? 3,
    fetchDetails: cfg.fetchDetails ?? true,
    urls: (cfg.urls ?? []).join("\n"),
    feedUrl: cfg.feedUrl ?? "",
    intervalMinutes: p.intervalMinutes,
    notifyEnabled: p.notifyEnabled,
    notifyMinScore: p.notifyMinScore,
    notifyChannels: p.notifyChannels as string[],
    prioritizeNew: p.prioritizeNew,
    query: p.query,
    tree: await loadTree(p.id),
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-[32px] font-semibold tracking-tight">{p.name}</h1>
      <ProfileEditor initial={value} savedFilters={saved.map((f) => ({ id: f.id, name: f.name, tree: f.tree as unknown as Group }))} categories={cats.categories} />
    </div>
  );
}
