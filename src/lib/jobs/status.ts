import { prisma } from "../db/client";
import { getConfig } from "../settings/store";
import { notifyPrefsSchema, quietEndsAt } from "../notify/prefs";

const notificationFields = {
  channel: true, status: true, error: true, createdAt: true, sentAt: true,
} as const;
const redactError = (error: string | null) => error?.replace(/https?:\/\/[^\s]+/g, "[endpoint]") ?? null;

/** Alleen begrensde operationele gegevens; geen pushendpoints, sleutels of e-mailadressen. */
export async function getJobStatus(externalId?: string) {
  const [cfg, heartbeat, devices, users, profiles, latestNotifications, ads, queue] = await Promise.all([
    getConfig(),
    prisma.appSettings.findUnique({ where: { key: "worker:heartbeat" } }),
    prisma.pushSubscription.findMany({ take: 20, select: {
      enabled: true, failures: true, lastSuccessAt: true, lastFailureAt: true, lastError: true, userAgent: true,
    } }),
    prisma.user.findMany({ take: 20, select: { notifyPrefs: true } }),
    prisma.searchProfile.findMany({ where: { active: true }, take: 50, select: {
      name: true, notifyEnabled: true, notifyMinScore: true, lastSuccessAt: true, lastError: true,
    } }),
    prisma.notification.findMany({ where: { channel: "WEBPUSH" }, orderBy: { createdAt: "desc" }, take: 10,
      select: { ...notificationFields, ad: { select: { externalId: true, title: true, url: true, firstSeenAt: true } } } }),
    prisma.advertisement.findMany({ where: { isDemo: false, ...(externalId ? { source: "marktplaats", externalId } : {}) },
      orderBy: { firstSeenAt: "desc" }, take: externalId ? 1 : 10, select: {
        externalId: true, title: true, url: true, firstSeenAt: true, lastSeenAt: true,
        publishedAt: true, prefilteredAt: true, analyzedAt: true, detailFetchedAt: true,
        status: true, statusError: true, userState: true, duplicateOfId: true,
        risk: { select: { blocked: true, flags: true } },
        matches: { where: { profile: { active: true } }, select: { matched: true } },
        notifications: { where: { channel: "WEBPUSH" }, select: notificationFields },
      } }),
    prisma.backgroundJob.groupBy({ by: ["type", "status"], _count: { _all: true },
      where: { status: { in: ["PENDING", "RUNNING", "FAILED", "DEAD"] } } }),
  ]);
  const at = (heartbeat?.value as { at?: string } | null)?.at ?? null;
  return {
    generatedAt: new Date().toISOString(),
    worker: { at, healthy: !!at && Date.now() - Date.parse(at) < 90_000 },
    config: { notificationsEnabled: cfg.notifications.enabled,
      requireFullAnalysis: cfg.notifications.requireFullAnalysis,
      fastEnabled: cfg.scheduler.fast.enabled, intervalSeconds: cfg.scheduler.fast.intervalSeconds },
    devices: devices.map(({ userAgent, ...d }) => ({ ...d, lastError: redactError(d.lastError),
      platform: /iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent) ? "ios"
        : /Android/i.test(userAgent) ? "android"
        : /Windows|Macintosh|X11/i.test(userAgent) ? "desktop" : "unknown",
    })),
    preferences: users.map((u) => {
      const p = notifyPrefsSchema.parse(u.notifyPrefs ?? {});
      return { push: p.push, mode: p.mode, minScore: p.minScore, minProfitEuro: p.minProfitEuro,
        selectedProfileCount: p.profileIds.length, quietUntil: quietEndsAt(p) };
    }),
    profiles,
    latestNotifications: latestNotifications.map((n) => ({ ...n, error: redactError(n.error) })),
    lookup: externalId ? { externalId, found: ads.length > 0 } : null,
    ads: ads.map((ad) => {
      const notifications = ad.notifications.map((n) => ({ ...n, error: redactError(n.error) }));
      const stage = notifications.some((n) => n.status === "SENT") ? "push_accepted"
        : notifications.some((n) => n.status === "PENDING") ? "push_queued"
        : notifications.some((n) => n.status === "FAILED") ? "push_failed"
        : notifications.some((n) => n.status === "SKIPPED") ? "push_skipped"
        : ad.risk?.blocked || ad.userState === "IGNORED" ? "excluded"
        : ad.duplicateOfId ? "duplicate"
        : ad.status === "FAILED" ? "analysis_failed"
        : !ad.prefilteredAt && !ad.analyzedAt ? "awaiting_analysis"
        : !ad.matches.some((m) => m.matched) ? "not_matched"
        : "no_notification_created";
      return { ...ad, notifications, stage };
    }),
    queue,
  };
}
