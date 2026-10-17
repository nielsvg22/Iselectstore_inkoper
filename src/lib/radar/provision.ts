import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { getConfig, saveConfig } from "../settings/store";
import type { Group, Node } from "../engines/filters";
import { APELDOORN_CENTER, APELDOORN_RADAR_NAME, APELDOORN_RADIUS_KM, apeldoornRadarTree, localRadarTree, priorityRadarTree, shippingRadarTree } from "./apeldoorn";

/**
 * Door de beheerder bewust te starten. De oude profielen (inclusief regels)
 * worden voor verwijdering opgeslagen als JSON-back-up in AppSettings.
 * Advertenties, aankopen, notificaties en eigen bestaande filters blijven staan.
 */
export async function installApeldoornRadar(userId: string) {
  const current = await prisma.searchProfile.findMany({ where: { userId }, include: { rules: true }, orderBy: { createdAt: "asc" } });
  const backupKey = `backup:profiles:${userId}:${Date.now()}`;
  const newProfile = await prisma.$transaction(async (tx) => {
    await tx.appSettings.create({
      data: {
        key: backupKey,
        value: {
          version: 1,
          savedAt: new Date().toISOString(),
          profiles: current.map((p) => ({
            profile: { id: p.id, name: p.name, sourceKind: p.sourceKind, query: p.query, sourceConfig: p.sourceConfig, intervalMinutes: p.intervalMinutes, notifyEnabled: p.notifyEnabled, notifyChannels: p.notifyChannels, notifyMinScore: p.notifyMinScore },
            rules: p.rules.map((r) => ({ kind: r.kind, parentId: r.parentId, id: r.id, field: r.field, operator: r.operator, value: r.value, op: r.op, position: r.position })),
          })),
        } as Prisma.InputJsonValue,
      },
    });
    await tx.searchProfile.deleteMany({ where: { userId } });
    const profile = await tx.searchProfile.create({
      data: {
        userId,
        name: APELDOORN_RADAR_NAME,
        active: true,
        query: "Apple-toestellen · lokaal ophalen of betrouwbaar verzenden",
        sourceKind: "SEARCH",
        sourceConfig: {
          queries: ["iphone", "macbook", "ipad", "apple watch", "airpods"],
          category: "",
          maxPages: 1,
          fetchDetails: true,
          fastMode: true,
          sliceSearch: false,
          center: APELDOORN_CENTER,
          radiusKm: APELDOORN_RADIUS_KM,
          /** Metadata, geen claim dat Marktplaats deze locatie al ondersteunt. */
          locationNeedsVerification: true,
        },
        intervalMinutes: 5,
        notifyEnabled: true,
        notifyMinScore: 60,
        prioritizeNew: true,
        notifyChannels: [],
      },
    });
    const insert = async (node: Node, parentId: string | null, position: number): Promise<void> => {
      if ("children" in node) {
        const row = await tx.searchRule.create({ data: { profileId: profile.id, parentId, kind: "GROUP", op: node.op, position } });
        for (let i = 0; i < node.children.length; i++) await insert(node.children[i], row.id, i);
      } else {
        await tx.searchRule.create({ data: { profileId: profile.id, parentId, kind: "CONDITION", field: node.field, operator: node.operator, value: node.value as Prisma.InputJsonValue, position } });
      }
    };
    await insert(apeldoornRadarTree, null, 0);
    const presets: Array<{ name: string; tree: Group }> = [
      { name: "Binnen 40 km", tree: localRadarTree },
      { name: "Verzenden · bewezen verkoper", tree: shippingRadarTree },
      { name: "Topkansen", tree: priorityRadarTree },
    ];
    for (const preset of presets) {
      await tx.savedFilter.upsert({
        where: { userId_name: { userId, name: preset.name } },
        create: { userId, name: preset.name, tree: preset.tree as unknown as Prisma.InputJsonValue },
        update: { tree: preset.tree as unknown as Prisma.InputJsonValue },
      });
    }
    return profile;
  }, { timeout: 90_000, maxWait: 15_000 });

  // Maximale reactiesnelheid binnen bestaande bron-throttling.
  // Dit is een doelinterval, GEEN garantie op zichtbaarheid binnen 60 seconden.
  const cfg = await getConfig(true);
  await saveConfig({
    targets: { defaultLocation: APELDOORN_CENTER, searchRadiusKm: APELDOORN_RADIUS_KM },
    policies: { distance: { pickupMaxKm: APELDOORN_RADIUS_KM } },
    scheduler: {
      fast: {
        enabled: true,
        intervalSeconds: 60,
        pages: 1,
        maxRequestsPerMinute: Math.max(cfg.scheduler.fast.maxRequestsPerMinute, 6),
      },
    },
  });
  await prisma.auditLog.create({ data: { userId, action: "profile.apeldoorn-radar.install", entity: "SearchProfile", entityId: newProfile.id } });
  return { id: newProfile.id, name: newProfile.name, removed: current.length, backupKey };
}
