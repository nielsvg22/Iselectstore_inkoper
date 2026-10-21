import { prisma } from "./db/client";
import { getConfig, getSecret } from "./settings/store";
import { OFFICIAL_SOURCE, tokenFingerprint } from "./sources/marktplaats-official";
import { accessStatus } from "./sources/access-status";

type PauseRow = { at?: string; until?: string; reason?: string };
type ApiGate = { nextAt?: number; blockedFingerprint?: string; status?: number };

/** Read-only database snapshot; opening the status screen never probes Marktplaats. */
export async function getSourceMonitor() {
  const cfg = await getConfig();
  const [health, rows, profiles, token] = await Promise.all([
    prisma.sourceHealth.findMany({ where: { id: { in: ["marktplaats-search", OFFICIAL_SOURCE] } } }),
    prisma.appSettings.findMany({ where: { key: { in: ["worker:heartbeat", "cooldown:marktplaats-search", `source:${OFFICIAL_SOURCE}:gate`] } } }),
    prisma.searchProfile.findMany({ where: { active: true, sourceKind: { in: ["SEARCH", "PARTNER_API"] } },
      select: { sourceKind: true, sourceConfig: true, intervalMinutes: true, lastSuccessAt: true, lastError: true, lastCheckedAt: true } }),
    getSecret("marktplaats.accessToken"),
  ]);
  const now = Date.now();
  const value = <T,>(key: string) => rows.find(r => r.key === key)?.value as T | undefined;
  const at = value<{ at?: string }>("worker:heartbeat")?.at ?? null;
  const age = at ? now - Date.parse(at) : NaN;
  const worker = { at, healthy: Number.isFinite(age) && age >= 0 && age < 90_000 };
  const cooldown = value<PauseRow>("cooldown:marktplaats-search");
  const gate = value<ApiGate>(`source:${OFFICIAL_SOURCE}:gate`);
  const credentialBlocked = !!token && gate?.blockedFingerprint === tokenFingerprint(token);
  const sources = [
    { id: "marktplaats-search", label: "Marktplaats-zoekpagina’s", origin: "SEARCH", enabled: cfg.sources.allowed.includes("SEARCH"), configured: true,
      requestLimit: cfg.scheduler.fast.maxRequestsPerMinute,
      pause: cooldown?.until ? { at: cooldown.at ?? null, until: cooldown.until, reason: cooldown.reason ?? "" } : null },
    { id: OFFICIAL_SOURCE, label: "Officiële Search API", origin: "PARTNER_API", enabled: cfg.officialApi.enabled && cfg.sources.allowed.includes("PARTNER_API"),
      configured: cfg.officialApi.accessApproved && !!token, requestLimit: cfg.officialApi.requestsPerMinute,
      pause: gate?.status && (credentialBlocked || (gate.nextAt ?? 0) > now)
        ? { at: null, until: credentialBlocked ? null : new Date(gate.nextAt!).toISOString(), reason: `HTTP ${gate.status}` } : null },
  ].map(source => {
    const h = health.find(h => h.id === source.id);
    const active = profiles.filter(p => p.sourceKind === source.origin || (source.origin === "PARTNER_API" && p.sourceKind === "SEARCH" && (p.sourceConfig as { smartRadar?: boolean } | null)?.smartRadar));
    const interval = active.length ? Math.min(...active.map(p => source.origin === "PARTNER_API" ? cfg.officialApi.intervalSeconds
      : cfg.scheduler.fast.enabled && (p.sourceConfig as { fastMode?: boolean } | null)?.fastMode ? cfg.scheduler.fast.intervalSeconds : p.intervalMinutes * 60)) : null;
    const latest = active.filter(p => p.lastError).sort((a, b) => (b.lastCheckedAt?.getTime() ?? 0) - (a.lastCheckedAt?.getTime() ?? 0))[0];
    // Official successes are tracked separately, never borrowed from the HTML profile.
    const successes = [h?.lastOkAt, ...(source.origin === "SEARCH" ? active.map(p => p.lastSuccessAt) : [])].filter((d): d is Date => !!d);
    const lastSuccessAt = successes.length ? new Date(Math.max(...successes.map(d => d.getTime()))).toISOString() : null;
    return { id: source.id, label: source.label, requestLimit: source.requestLimit, intervalSeconds: interval,
      ...accessStatus({ enabled: source.enabled, configured: source.configured, hasProfiles: active.length > 0,
        lastSuccessAt, lastError: h?.lastError ?? (source.origin === "SEARCH" ? latest?.lastError ?? null : null),
        lastErrorAt: (h?.lastErrorAt ?? (source.origin === "SEARCH" ? latest?.lastCheckedAt : null))?.toISOString() ?? null,
        staleAfterMs: Math.max(120_000, (interval ?? 60) * 2000 + 30_000), pause: source.pause }, now) };
  });
  return { generatedAt: new Date(now).toISOString(), worker, sources };
}

export type SourceMonitor = Awaited<ReturnType<typeof getSourceMonitor>>;
