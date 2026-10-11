import { prisma } from "../db/client";

const key = (source: string) => `cooldown:${source}`;
const MIN = 15 * 60_000;
const MAX = 2 * 3600_000;

export interface Cooldown {
  until: Date;
  level: number;
  reason: string;
}

/** Actieve pauze voor een bron (na HTTP 403/429): er wordt niet doorgedrukt of omzeild. */
export async function getCooldown(source: string, now = new Date()): Promise<Cooldown | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: key(source) } });
  if (!row) return null;
  const v = row.value as { until: string; level: number; reason: string };
  const until = new Date(v.until);
  return until > now ? { until, level: v.level, reason: v.reason } : null;
}

/** Verdubbelt de pauze bij herhaalde blokkades (15 min → 30 → 60 → max 2 uur). */
export async function setCooldown(source: string, reason: string, now = new Date()): Promise<Cooldown> {
  const row = await prisma.appSettings.findUnique({ where: { key: key(source) } });
  const prev = row ? (row.value as { level: number; at?: string }) : null;
  const recent = prev?.at && now.getTime() - new Date(prev.at).getTime() < 6 * 3600_000;
  const level = recent ? Math.min(4, (prev?.level ?? 0) + 1) : 1;
  const until = new Date(now.getTime() + Math.min(MAX, MIN * 2 ** (level - 1)));
  const value = { until: until.toISOString(), level, reason: reason.slice(0, 200), at: now.toISOString() };
  await prisma.appSettings.upsert({ where: { key: key(source) }, create: { key: key(source), value }, update: { value } });
  return { until, level, reason };
}
