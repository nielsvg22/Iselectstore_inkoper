import { z } from "zod";
import { prisma } from "./db/client";
import { getCooldown } from "./jobs/cooldown";
import { saveTree } from "./pipeline/tree";
import { customProfilesAllowed } from "./profile-lock";
import { twanScope } from "./radar/twan-scope";
import { saveConfig, getConfig } from "./settings/store";

export const vintedRadarInput = z.object({
  enabled: z.boolean().optional(),
  intervalSeconds: z.number().int().min(30).max(3600).optional(),
  minGapSeconds: z.number().int().min(3).max(120).optional(),
  pages: z.number().int().min(1).max(5).optional(),
  queries: z.array(z.string().trim().min(2).max(60)).max(12).optional(),
  priceFrom: z.number().min(0).max(100000).nullable().optional(),
  priceTo: z.number().min(0).max(100000).nullable().optional(),
});

/** Zoektermen volgen uit de modellenlijst (zelfde als Marktplaats); eigen zoektermen kunnen niet meer worden ingesteld. */
export async function defaultVintedQueries(): Promise<string[]> {
  return (await twanScope()).queries;
}

/** Maakt of werkt het Vinted-zoekprofiel bij (één per gebruiker) en past de Vinted-schaalinstellingen toe. Idempotent. */
export async function provisionVintedRadar(userId: string, input: z.infer<typeof vintedRadarInput>) {
  const cfg = await saveConfig({
    scheduler: { vinted: {
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(input.intervalSeconds ? { intervalSeconds: input.intervalSeconds } : {}),
      ...(input.minGapSeconds ? { minGapSeconds: input.minGapSeconds } : {}),
      ...(input.pages ? { pages: input.pages } : {}),
    } },
  });
  const queries = customProfilesAllowed() && input.queries?.length ? input.queries : await defaultVintedQueries();
  const existing = (await prisma.searchProfile.findMany({ where: { userId, sourceKind: "SEARCH" } })).find((p) => (p.sourceConfig as { platform?: string } | null)?.platform === "vinted");
  const sourceConfig = {
    ...((existing?.sourceConfig ?? {}) as object),
    platform: "vinted", queries, maxPages: 1, fetchDetails: true, fastMode: true,
    priceFrom: input.priceFrom ?? (existing?.sourceConfig as { priceFrom?: number | null } | null)?.priceFrom ?? null,
    priceTo: input.priceTo ?? (existing?.sourceConfig as { priceTo?: number | null } | null)?.priceTo ?? null,
  };
  if (existing) {
    await prisma.searchProfile.update({ where: { id: existing.id }, data: { sourceConfig, active: true, query: queries.join(", ") } });
    return { id: existing.id, created: false, config: cfg.scheduler.vinted, queries };
  }
  const p = await prisma.searchProfile.create({ data: {
    userId, name: "Vinted — Apple (Nederland)", active: true, query: queries.join(", "), sourceKind: "SEARCH", sourceConfig,
    intervalMinutes: 5, notifyEnabled: true, notifyChannels: [], notifyMinScore: 0, prioritizeNew: true,
  } });
  await saveTree(p.id, { op: "AND", children: [] });
  return { id: p.id, created: true, config: cfg.scheduler.vinted, queries };
}

export async function vintedStatus(userId: string) {
  const cfg = await getConfig();
  const profile = (await prisma.searchProfile.findMany({ where: { userId, sourceKind: "SEARCH" } })).find((p) => (p.sourceConfig as { platform?: string } | null)?.platform === "vinted");
  const [cooldown, health, adCount] = await Promise.all([
    getCooldown("vinted-search"),
    prisma.sourceHealth.findUnique({ where: { id: "vinted-search" } }),
    prisma.advertisement.count({ where: { source: "vinted", isDemo: false } }),
  ]);
  return {
    settings: cfg.scheduler.vinted,
    profile: profile ? { id: profile.id, active: profile.active, lastCheckedAt: profile.lastCheckedAt?.toISOString() ?? null, lastSuccessAt: profile.lastSuccessAt?.toISOString() ?? null, lastError: profile.lastError, queries: (profile.sourceConfig as { queries?: string[] }).queries ?? [] } : null,
    cooldown: cooldown ? { until: cooldown.until.toISOString(), reason: cooldown.reason } : null,
    health: health ? { ok: health.ok, lastOkAt: health.lastOkAt?.toISOString() ?? null, lastError: health.lastError, requestsToday: health.requestsToday } : null,
    adCount,
  };
}
