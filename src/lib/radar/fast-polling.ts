import { prisma } from "../db/client";
import { configSchema } from "../config/schema";
import { resetConfigCache } from "../settings/store";

/** Eenmalige, herstelbare versnelling van de bestaande centrale radar. */
export async function upgradeRadarPolling() {
  const changed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('radar-fast-polling-v1'))`;
    const key = "provision:radar-fast-polling-v1";
    if (await tx.appSettings.findUnique({ where: { key } })) return false;
    const radar = await tx.searchProfile.findFirst({ where: { active: true,
      sourceConfig: { path: ["smartRadar"], equals: true } }, select: { id: true } });
    if (!radar) return false;
    const before = await tx.appSettings.findUnique({ where: { key: "config" } });
    const cfg = configSchema.parse(before?.value ?? {});
    // Bewust afwijkende intervallen en uitgeschakelde modus blijven gerespecteerd.
    const accelerate = cfg.scheduler.fast.enabled && cfg.scheduler.fast.intervalSeconds === 60;
    if (accelerate) {
      cfg.scheduler.fast.intervalSeconds = 30;
      await tx.appSettings.upsert({ where: { key: "config" },
        create: { key: "config", value: cfg }, update: { value: cfg } });
    }
    await tx.appSettings.create({ data: { key, value: {
      at: new Date().toISOString(), changed: accelerate, before: before?.value ?? null,
    } } });
    return accelerate;
  });
  resetConfigCache();
  return changed;
}
