import { CAT } from "./catalog/apple";
import { prisma } from "./db/client";
import { log } from "./log";
import { saveTree } from "./pipeline/tree";
import { getConfig, saveConfig } from "./settings/store";
import { allIphoneModels, defaultPriorityModels, OPSLAGEN } from "./sources/slice-plan";

export const IPHONE_MELDER_NAME = "iPhone-melder (alle iPhones)";

/** Maakt (of werkt bij) het profiel dat elke nieuwe iPhone meldt: alle iPhone-modellen × opslag als smalle lijsten, snelle modus. */
export async function provisionIphoneMelder(userId: string): Promise<{ id: string; created: boolean }> {
  const sourceConfig = {
    // vangnet: volledige zoektermen (ook voor modellen zonder filterpagina)
    queries: ["iphone 17", "iphone air", "iphone se", "iphone"],
    category: CAT.iphone,
    maxPages: 3,
    fetchDetails: true,
    fastMode: true,
    sliceSearch: true,
    sliceModels: allIphoneModels(),
    sliceStorages: OPSLAGEN,
    priorityModels: defaultPriorityModels(),
  };
  const existing = await prisma.searchProfile.findFirst({ where: { userId, name: IPHONE_MELDER_NAME } });
  const data = { name: IPHONE_MELDER_NAME, active: true, query: "Alle iPhones: melding bij elke nieuwe advertentie", sourceKind: "SEARCH" as const, sourceConfig, intervalMinutes: 10, notifyEnabled: true, notifyMinScore: 0, notifyChannels: [], prioritizeNew: true };
  const keepBaseline = (existing?.sourceConfig as { baselineAt?: string } | null)?.baselineAt;
  const p = existing
    ? await prisma.searchProfile.update({ where: { id: existing.id }, data: { ...data, sourceConfig: { ...sourceConfig, ...(keepBaseline ? { baselineAt: keepBaseline } : {}) } } })
    : await prisma.searchProfile.create({ data: { ...data, userId } });
  await saveTree(p.id, { op: "AND", children: [{ field: "family", operator: "in", value: ["iphone"] }] });
  return { id: p.id, created: !existing };
}

const FLAG = "provision:iphone-melder";

/**
 * Eenmalig, automatisch op de server: zodra er een beheerder is, wordt de iPhone-melder aangemaakt en de snelle modus aangezet.
 * Daarna nooit meer automatisch (ook niet na verwijderen of pauzeren door de gebruiker); de knop bij Zoekopdrachten kan het opnieuw doen.
 */
export async function ensureDefaultProfiles(): Promise<"gedaan" | "al-gedaan" | "wacht-op-beheerder"> {
  if (await prisma.appSettings.findUnique({ where: { key: FLAG } })) return "al-gedaan";
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) return "wacht-op-beheerder";
  const { id } = await provisionIphoneMelder(admin.id);
  const cfg = await getConfig(true);
  // Snelle modus aan; de paginarem alleen verhogen als hij nog op de standaardwaarde (6) staat
  await saveConfig({ scheduler: { fast: { enabled: true, ...(cfg.scheduler.fast.maxRequestsPerMinute === 6 ? { maxRequestsPerMinute: 12 } : {}) } } });
  await prisma.appSettings.upsert({ where: { key: FLAG }, create: { key: FLAG, value: { at: new Date().toISOString(), profileId: id } }, update: { value: { at: new Date().toISOString(), profileId: id } } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "profile.iphone-melder.auto", entity: "SearchProfile", entityId: id } });
  log("info", "iPhone-melder automatisch aangemaakt", { profileId: id });
  return "gedaan";
}
