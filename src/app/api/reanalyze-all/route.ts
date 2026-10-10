import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { enqueue } from "@/lib/jobs/queue";
import { getConfig } from "@/lib/settings/store";

/** Zet na wijzigingen in instellingen alle actuele advertenties opnieuw in de analysewachtrij. */
export const POST = route(
  async () => {
    const cfg = await getConfig();
    const ads = await prisma.advertisement.findMany({ where: { isDemo: cfg.demoMode, duplicateOfId: null }, select: { id: true }, take: 5000 });
    const stamp = Date.now();
    for (const a of ads) await enqueue({ type: "ANALYZE_AD", payload: { adId: a.id }, priority: 2, uniqueKey: `analyze:${a.id}:all:${stamp}` });
    return { queued: ads.length };
  },
  { admin: true },
);
