import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { CAT } from "@/lib/catalog/apple";
import { saveConfig } from "@/lib/settings/store";
import { saveTree } from "@/lib/pipeline/tree";
import { allIphoneModels, defaultPriorityModels, OPSLAGEN } from "@/lib/sources/slice-plan";

const NAME = "iPhone-melder (alle iPhones)";

/**
 * Eén tik: maakt een zoekprofiel dat ELKE nieuwe iPhone meldt (snelle modus, smalle lijsten per model en opslag,
 * rondlopend, prioriteit voor iPhone 13 en nieuwer) en zet de snelle modus globaal aan. Idempotent.
 */
export const POST = route(
  async (_req, { user }) => {
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
    const existing = await prisma.searchProfile.findFirst({ where: { userId: user.id, name: NAME } });
    const data = { name: NAME, active: true, query: "Alle iPhones: melding bij elke nieuwe advertentie", sourceKind: "SEARCH" as const, sourceConfig, intervalMinutes: 10, notifyEnabled: true, notifyMinScore: 0, notifyChannels: [], prioritizeNew: true };
    const p = existing ? await prisma.searchProfile.update({ where: { id: existing.id }, data: { ...data, sourceConfig: { ...sourceConfig, ...((existing.sourceConfig as { baselineAt?: string } | null)?.baselineAt ? { baselineAt: (existing.sourceConfig as { baselineAt: string }).baselineAt } : {}) } } }) : await prisma.searchProfile.create({ data: { ...data, userId: user.id } });
    await saveTree(p.id, { op: "AND", children: [{ field: "family", operator: "in", value: ["iphone"] }] });
    const cfg = await saveConfig({ scheduler: { fast: { enabled: true } } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "profile.iphone-melder", entity: "SearchProfile", entityId: p.id } });
    return { id: p.id, created: !existing, fast: cfg.scheduler.fast };
  },
  { admin: true },
);
