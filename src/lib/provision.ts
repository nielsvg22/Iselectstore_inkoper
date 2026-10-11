import { APPLE_MODELS, CAT } from "./catalog/apple";
import { prisma } from "./db/client";
import { log } from "./log";
import { saveTree } from "./pipeline/tree";
import { getConfig, saveConfig } from "./settings/store";
import { defaultPriorityModels, OPSLAGEN } from "./sources/slice-plan";

export const IPHONE_GROUP = "iPhone";
/** Oude, enkele samenvattingsprofiel uit een eerdere versie (wordt vervangen door profielen per model). */
export const LEGACY_IPHONE_MELDER_NAME = "iPhone-melder (alle iPhones)";
export const IPHONE_REST_NAME = "iPhone – overige modellen";

/**
 * Maakt (of werkt bij) één zoekprofiel PER iPhone-model, ingedeeld in de categorie "iPhone": elk model heeft zijn eigen
 * snelle controle (smalle lijsten per opslag), eigen status en eigen interval (iPhone 13 en nieuwer vaker). Plus één
 * "overige modellen"-profiel voor advertenties die we niet aan een model kunnen koppelen. Idempotent.
 */
export async function provisionIphoneMelder(userId: string): Promise<{ id: string; created: boolean; models: number; createdModels: number }> {
  const models = APPLE_MODELS.filter((m) => m.category === CAT.iphone);
  const high = new Set(defaultPriorityModels());
  let createdModels = 0;
  let firstId = "";
  const common = { active: true, sourceKind: "SEARCH" as const, intervalMinutes: 10, notifyEnabled: true, notifyMinScore: 0, notifyChannels: [], prioritizeNew: true };
  for (const m of models) {
    const sourceConfig = {
      queries: [m.term],
      category: CAT.iphone,
      maxPages: 3,
      fetchDetails: true,
      fastMode: true,
      sliceSearch: true,
      sliceModels: [m.key],
      sliceStorages: OPSLAGEN,
      group: IPHONE_GROUP,
      auto: true,
      tier: high.has(m.key) ? ("high" as const) : ("normal" as const),
    };
    const existing = await prisma.searchProfile.findFirst({ where: { userId, name: m.label } });
    const keep = (existing?.sourceConfig as { baselineAt?: string } | null)?.baselineAt;
    const data = { ...common, name: m.label, query: `${m.label}: melding bij elke nieuwe advertentie`, sourceConfig: { ...sourceConfig, ...(keep ? { baselineAt: keep } : {}) } };
    const p = existing ? await prisma.searchProfile.update({ where: { id: existing.id }, data }) : await prisma.searchProfile.create({ data: { ...data, userId } });
    if (!existing) createdModels++;
    await saveTree(p.id, { op: "AND", children: [{ field: "modelKey", operator: "in", value: [m.key] }] });
    if (!firstId) firstId = p.id;
  }
  // Advertenties die aan geen enkel model te koppelen zijn (typfouten, onbekende varianten): gewone zoekterm, gewoon interval
  const rest = await prisma.searchProfile.findFirst({ where: { userId, name: IPHONE_REST_NAME } });
  const restData = { ...common, name: IPHONE_REST_NAME, query: "iPhones zonder herkend model", sourceConfig: { queries: ["iphone"], category: CAT.iphone, maxPages: 3, fetchDetails: true, fastMode: true, sliceSearch: false, group: IPHONE_GROUP, auto: true, tier: "normal" as const } };
  const rp = rest ? await prisma.searchProfile.update({ where: { id: rest.id }, data: restData }) : await prisma.searchProfile.create({ data: { ...restData, userId } });
  await saveTree(rp.id, { op: "AND", children: [{ field: "family", operator: "in", value: ["iphone"] }, { field: "modelKey", operator: "nin", value: models.map((m) => m.key) }] });
  // Het oude samenvattingsprofiel (alle modellen in één) vervalt
  await prisma.searchProfile.deleteMany({ where: { userId, name: LEGACY_IPHONE_MELDER_NAME } });
  return { id: firstId, created: createdModels > 0 || !rest, models: models.length, createdModels };
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
  log("info", "iPhone-profielen per model automatisch aangemaakt", { profileId: id });
  return "gedaan";
}
