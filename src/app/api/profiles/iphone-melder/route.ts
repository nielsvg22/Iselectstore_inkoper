import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { provisionIphoneMelder } from "@/lib/provision";
import { saveConfig } from "@/lib/settings/store";

/**
 * Eén tik: maakt (of werkt bij) het profiel dat ELKE nieuwe iPhone meldt en zet de snelle modus globaal aan. Idempotent.
 * (Bij een nieuwe installatie gebeurt dit ook automatisch op de server, zie lib/provision.ts.)
 */
export const POST = route(
  async (_req, { user }) => {
    const r = await provisionIphoneMelder(user.id);
    const cfg = await saveConfig({ scheduler: { fast: { enabled: true } } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "profile.iphone-melder", entity: "SearchProfile", entityId: r.id } });
    return { ...r, fast: cfg.scheduler.fast };
  },
  { admin: true },
);
