import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { saveTree, loadTree } from "../pipeline/tree";
import type { Group } from "../engines/filters";
import { customProfilesAllowed, isSystemProfile } from "../profile-lock";
import { APELDOORN_RADAR_NAME } from "./apeldoorn";
import { installApeldoornRadar } from "./provision";
import { twanScope, type TwanScope } from "./twan-scope";

/** Regelboom van het vaste profiel: alleen de productgroepen uit de lijst, nooit geblokkeerde advertenties. */
export const twanTree = (scope: Pick<TwanScope, "families">): Group => ({
  op: "AND",
  children: [{ field: "family", operator: "in", value: scope.families }, { field: "blocked", operator: "isFalse" }],
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Voorwaarden zonder waarde (isFalse) komen uit de database met value null terug; die zijn gelijk aan een ontbrekende waarde. */
const norm = (n: unknown): unknown => {
  const x = n as { children?: unknown[]; value?: unknown };
  if (Array.isArray(x.children)) return { ...(n as object), children: x.children.map(norm) };
  const { value, ...rest } = n as { value?: unknown };
  return value == null ? rest : n;
};

export interface EnsureResult {
  radarId: string | null;
  vintedId: string | null;
  updated: string[];
  deactivated: number;
  scope: TwanScope;
}

/**
 * Zorgt dat er precies één zoekprofiel per platform is, zoals Twan het wil: de zoektermen, modellen en opslagen volgen
 * uit de modellenlijst en de inkoopregels (iPhone 14 en nieuwer). Eigen profielen worden gepauzeerd (niet verwijderd, dus
 * terug te zetten). Idempotent en goedkoop: alleen schrijven als er iets verschilt.
 * Met `enforce: false` (tests en lokaal ontwikkelen) blijven andere profielen met rust.
 */
export async function ensureTwanProfiles(userId: string, opts: { enforce?: boolean } = {}): Promise<EnsureResult> {
  const enforce = opts.enforce ?? !customProfilesAllowed();
  const scope = await twanScope();
  const updated: string[] = [];

  const all = await prisma.searchProfile.findMany({ where: { userId } });
  let radar = all.find((p) => p.name === APELDOORN_RADAR_NAME) ?? null;
  const vintedBefore = all.find((p) => (p.sourceConfig as { platform?: string } | null)?.platform === "vinted") ?? null;
  if (!radar && enforce) {
    await installApeldoornRadar(userId); // maakt het profiel, met back-up van de oude
    radar = await prisma.searchProfile.findFirst({ where: { userId, name: APELDOORN_RADAR_NAME } });
    // de migratie pauzeert alles; een Vinted-profiel dat aanstond blijft aan
    if (vintedBefore?.active) await prisma.searchProfile.update({ where: { id: vintedBefore.id }, data: { active: true } });
  }

  if (radar) {
    const next = { ...(radar.sourceConfig as object), queries: scope.queries, sliceModels: scope.sliceModels, priorityModels: scope.priorityModels, sliceStorages: scope.sliceStorages };
    const query = `Twan — ${scope.queries.join(", ")}${scope.fromList ? " · alleen modellen uit de lijst" : ""}`;
    if (!same(radar.sourceConfig, next) || radar.query !== query) {
      await prisma.searchProfile.update({ where: { id: radar.id }, data: { sourceConfig: next as Prisma.InputJsonValue, query } });
      updated.push("marktplaats");
    }
    if (!same(norm(await loadTree(radar.id)), norm(twanTree(scope)))) { await saveTree(radar.id, twanTree(scope)); updated.push("marktplaats-regels"); }
  }

  const vinted = vintedBefore;
  if (vinted) {
    const next = { ...(vinted.sourceConfig as object), queries: scope.queries };
    const query = scope.queries.join(", ");
    if (!same(vinted.sourceConfig, next) || vinted.query !== query) {
      await prisma.searchProfile.update({ where: { id: vinted.id }, data: { sourceConfig: next as Prisma.InputJsonValue, query } });
      updated.push("vinted");
    }
  }

  let deactivated = 0;
  if (enforce) {
    const custom = await prisma.searchProfile.findMany({ where: { active: true } });
    const ids = custom.filter((p) => !isSystemProfile(p)).map((p) => p.id);
    if (ids.length) {
      await prisma.searchProfile.updateMany({ where: { id: { in: ids } }, data: { active: false, notifyEnabled: false } });
      await prisma.auditLog.create({ data: { userId, action: "profile.custom-paused", entity: "SearchProfile", meta: { count: ids.length, ids: ids.slice(0, 50) } } });
      deactivated = ids.length;
    }
    // meldingsvoorkeuren die nog naar een gepauzeerd eigen profiel wijzen, volgen het vaste profiel
    const systemIds = [radar?.id, vinted?.id].filter((x): x is string => !!x);
    const users = await prisma.user.findMany({ select: { id: true, notifyPrefs: true } });
    for (const u of users) {
      const prefs = u.notifyPrefs as { profileIds?: string[] } | null;
      if (prefs?.profileIds?.length && systemIds.length && !same([...prefs.profileIds].sort(), [...systemIds].sort()))
        await prisma.user.update({ where: { id: u.id }, data: { notifyPrefs: { ...prefs, profileIds: systemIds } as Prisma.InputJsonValue } });
    }
  }
  return { radarId: radar?.id ?? null, vintedId: vinted?.id ?? null, updated, deactivated, scope };
}
