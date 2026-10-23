import { sharedNotifyUserIds } from "@/lib/notify/shared";
import type { Metadata } from "next";
import { CategoriesCard } from "@/components/catalog/categories-card";
import { SavedFiltersManager } from "@/components/filters/saved-filters-manager";
import { PushSettings } from "@/components/notify/push-settings";
import { UsersCard } from "@/components/settings/users-card";
import { SettingsForm } from "@/components/settings/settings-form";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import type { Group } from "@/lib/engines/filters";
import { getPrefs } from "@/lib/notify/prefs";
import { getConfig, secretStatus } from "@/lib/settings/store";
import { getAppleCategories } from "@/lib/sources/category-discovery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  const [user, cfg, secrets, cats] = await Promise.all([getCurrentUser(), getConfig(true), secretStatus(), getAppleCategories()]);
  const [prefs, profiles] = await Promise.all([getPrefs(user!.id), prisma.searchProfile.findMany({ where: { userId: user!.id }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const users = user!.role === "ADMIN" ? await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true } }) : [];
  const sharedIds = user!.role === "ADMIN" ? await sharedNotifyUserIds() : [];
  const filters = await prisma.savedFilter.findMany({ where: { userId: user!.id }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Instellingen</h1>
        <p className="mt-1 text-muted">Winstdoelen, kosten, belasting, integraties en limieten. Geheime sleutels worden versleuteld opgeslagen en komen nooit terug in de interface.</p>
      </div>
      <PushSettings initialPrefs={prefs} profiles={profiles} />
      <SavedFiltersManager filters={filters.map((f) => ({ id: f.id, name: f.name, tree: f.tree as unknown as Group }))} />
      {user!.role === "ADMIN" && <UsersCard users={users} sharedIds={sharedIds} />}
      <CategoriesCard data={cats} isAdmin={user!.role === "ADMIN"} />
      <SettingsForm initial={cfg} secrets={Object.fromEntries(secrets.map((s) => [s.key, s.isSet]))} isAdmin={user!.role === "ADMIN"} />
    </div>
  );
}
