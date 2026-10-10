import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { getCurrentUser } from "@/lib/auth";
import { getConfig, secretStatus } from "@/lib/settings/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  const [user, cfg, secrets] = await Promise.all([getCurrentUser(), getConfig(true), secretStatus()]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Instellingen</h1>
        <p className="mt-1 text-muted">Winstdoelen, kosten, belasting, integraties en limieten. Geheime sleutels worden versleuteld opgeslagen en komen nooit terug in de interface.</p>
      </div>
      <SettingsForm initial={cfg} secrets={Object.fromEntries(secrets.map((s) => [s.key, s.isSet]))} isAdmin={user!.role === "ADMIN"} />
    </div>
  );
}
