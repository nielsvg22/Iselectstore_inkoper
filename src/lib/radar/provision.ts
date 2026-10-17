import { APPLE_MODELS, CAT } from "../catalog/apple";
import { defaultPriorityModels } from "../sources/slice-plan";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { getConfig, saveConfig } from "../settings/store";
import type { Group, Node } from "../engines/filters";
import {
  APELDOORN_CENTER,
  APELDOORN_RADAR_NAME,
  APELDOORN_RADIUS_KM,
  apeldoornRadarTree,
  priorityRadarTree,
  shippingRadarTree,
} from "./apeldoorn";

/**
 * Door de beheerder bewust te starten. De oude profielen (inclusief regels)
 * worden voor archivering opgeslagen als JSON-back-up in AppSettings.
 * Advertenties, aankopen, notificaties en eigen bestaande filters blijven staan.
 */
export async function installApeldoornRadar(userId: string) {
  const installed = await prisma.searchProfile.findFirst({
    where: { userId, name: APELDOORN_RADAR_NAME, active: true },
  });
  if (installed)
    return {
      id: installed.id,
      name: installed.name,
      removed: 0,
      backupKey: null,
    };

  const backupKey = `backup:profiles:${userId}:${Date.now()}`;
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`radar:${userId}`}))`;
      const existing = await tx.searchProfile.findFirst({
        where: { userId, name: APELDOORN_RADAR_NAME, active: true },
      });
      if (existing) return { profile: existing, removed: 0, backupKey: null };
      const current = await tx.searchProfile.findMany({
        where: { userId },
        include: { rules: true },
        orderBy: { createdAt: "asc" },
      });
      await tx.appSettings.create({
        data: {
          key: backupKey,
          value: {
            version: 1,
            config:
              (await tx.appSettings.findUnique({ where: { key: "config" } }))
                ?.value ?? {},
            notifyPrefs: (
              await tx.user.findUniqueOrThrow({
                where: { id: userId },
                select: { notifyPrefs: true },
              })
            ).notifyPrefs,
            savedAt: new Date().toISOString(),
            profiles: current.map((p) => ({
              profile: {
                lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
                lastSuccessAt: p.lastSuccessAt?.toISOString() ?? null,
                createdAt: p.createdAt.toISOString(),
                active: p.active,
                prioritizeNew: p.prioritizeNew,
                id: p.id,
                name: p.name,
                sourceKind: p.sourceKind,
                query: p.query,
                sourceConfig: p.sourceConfig,
                intervalMinutes: p.intervalMinutes,
                notifyEnabled: p.notifyEnabled,
                notifyChannels: p.notifyChannels,
                notifyMinScore: p.notifyMinScore,
              },
              rules: p.rules.map((r) => ({
                kind: r.kind,
                parentId: r.parentId,
                id: r.id,
                field: r.field,
                operator: r.operator,
                value: r.value,
                op: r.op,
                position: r.position,
              })),
            })),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.appSettings.upsert({
        where: { key: "provision:iphone-melder" },
        create: { key: "provision:iphone-melder", value: { radar: true } },
        update: { value: { radar: true } },
      });
      await tx.notification.updateMany({
        where: {
          profileId: { in: current.map((p) => p.id) },
          status: "PENDING",
        },
        data: {
          status: "SKIPPED",
          error: "Profiel gearchiveerd bij radarmigratie",
        },
      });
      await tx.searchProfile.updateMany({
        where: { userId },
        data: { active: false, notifyEnabled: false },
      });
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
            smartRadar: true,
            sliceSearch: true,
            sliceModels: APPLE_MODELS.filter(
              (m) => m.category === CAT.iphone,
            ).map((m) => m.key),
            priorityModels: defaultPriorityModels(),
            sliceStorages: [128, 256, 512],
            center: APELDOORN_CENTER,
            radiusKm: APELDOORN_RADIUS_KM,
            /** Metadata, geen claim dat Marktplaats deze locatie al ondersteunt. */
            locationNeedsVerification: true,
          },
          intervalMinutes: 5,
          notifyEnabled: true,
          notifyMinScore: 0,
          prioritizeNew: true,
          notifyChannels: [],
        },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { notifyPrefs: true },
      });
      const prefs = user.notifyPrefs as { profileIds?: string[] } | null;
      if (prefs?.profileIds?.length)
        await tx.user.update({
          where: { id: userId },
          data: { notifyPrefs: { ...prefs, profileIds: [profile.id] } },
        });
      const insert = async (
        node: Node,
        parentId: string | null,
        position: number,
      ): Promise<void> => {
        if ("children" in node) {
          const row = await tx.searchRule.create({
            data: {
              profileId: profile.id,
              parentId,
              kind: "GROUP",
              op: node.op,
              position,
            },
          });
          for (let i = 0; i < node.children.length; i++)
            await insert(node.children[i], row.id, i);
        } else {
          await tx.searchRule.create({
            data: {
              profileId: profile.id,
              parentId,
              kind: "CONDITION",
              field: node.field,
              operator: node.operator,
              value: node.value as Prisma.InputJsonValue,
              position,
            },
          });
        }
      };
      await insert(apeldoornRadarTree, null, 0);
      const presets: Array<{ name: string; tree: Group }> = [
        { name: "Alle nieuwe kansen", tree: apeldoornRadarTree },
        { name: "Veilig verzenden", tree: shippingRadarTree },
        { name: "Topdeals", tree: priorityRadarTree },
      ];
      for (const preset of presets) {
        await tx.savedFilter.upsert({
          where: { userId_name: { userId, name: preset.name } },
          create: {
            userId,
            name: preset.name,
            tree: preset.tree as unknown as Prisma.InputJsonValue,
          },
          update: {},
        });
      }
      return { profile, removed: current.length, backupKey };
    },
    { timeout: 90_000, maxWait: 15_000 },
  );

  // Maximale reactiesnelheid binnen bestaande bron-throttling.
  // Dit is een doelinterval, GEEN garantie op zichtbaarheid binnen 60 seconden.
  const cfg = await getConfig(true);
  await saveConfig({
    targets: {
      defaultLocation: APELDOORN_CENTER,
      searchRadiusKm: APELDOORN_RADIUS_KM,
    },
    policies: { distance: { pickupMaxKm: APELDOORN_RADIUS_KM } },
    scheduler: {
      fast: {
        enabled: true,
        intervalSeconds: 30,
        pages: 1,
        maxRequestsPerMinute: cfg.scheduler.fast.maxRequestsPerMinute,
      },
    },
  });
  await prisma.auditLog.create({
    data: {
      userId,
      action: "profile.apeldoorn-radar.install",
      entity: "SearchProfile",
      entityId: result.profile.id,
    },
  });
  return {
    id: result.profile.id,
    name: result.profile.name,
    removed: result.removed,
    backupKey: result.backupKey,
  };
}

/** Herstel bestaande records in plaats van nieuwe IDs aan te maken: historie blijft gekoppeld. */
export async function restoreRadarProfiles(userId: string, backupKey: string) {
  if (!backupKey.startsWith(`backup:profiles:${userId}:`))
    throw new Error("Back-up hoort niet bij deze gebruiker");
  const row = await prisma.appSettings.findUnique({
    where: { key: backupKey },
  });
  const backup = row?.value as {
    notifyPrefs?: Prisma.InputJsonValue;
    profiles?: Array<{
      profile: { id: string; active?: boolean; notifyEnabled: boolean };
    }>;
  } | null;
  if (!backup?.profiles) throw new Error("Back-up niet gevonden");
  return prisma.$transaction(async (tx) => {
    await tx.searchProfile.updateMany({
      where: { userId, name: APELDOORN_RADAR_NAME },
      data: { active: false, notifyEnabled: false },
    });
    for (const p of backup.profiles!)
      await tx.searchProfile.updateMany({
        where: { id: p.profile.id, userId },
        data: {
          active: p.profile.active ?? true,
          notifyEnabled: p.profile.notifyEnabled,
        },
      });
    if (backup.notifyPrefs)
      await tx.user.update({
        where: { id: userId },
        data: { notifyPrefs: backup.notifyPrefs },
      });
    await tx.auditLog.create({
      data: {
        userId,
        action: "profile.radar.restore",
        entity: "AppSettings",
        entityId: backupKey,
      },
    });
    return { restored: backup.profiles!.length };
  });
}
