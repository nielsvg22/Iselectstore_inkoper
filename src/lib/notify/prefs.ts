import { z } from "zod";
import { prisma } from "../db/client";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Gebruik HH:MM");

export const notifyPrefsSchema = z.object({
  /** all = alle passende deals, top = alleen topdeals */
  mode: z.enum(["all", "top"]).default("all"),
  minProfitEuro: z.number().min(0).max(100000).nullable().default(null),
  minScore: z.number().int().min(0).max(100).nullable().default(null),
  /** leeg = alle zoekprofielen van de gebruiker */
  profileIds: z.array(z.string()).max(200).default([]),
  quiet: z.object({ enabled: z.boolean().default(false), start: hhmm.default("22:30"), end: hhmm.default("07:00") }).default({}),
  push: z.boolean().default(true),
  /** Pop-up in de app zodra er een nieuwe advertentie is (als de app open staat) */
  popup: z.boolean().default(true),
  /** profile = zoals ingesteld per zoekprofiel; fallback = alleen als er geen actief pushapparaat is; off = nooit */
  telegram: z.enum(["profile", "fallback", "off"]).default("profile"),
});
export type NotifyPrefs = z.infer<typeof notifyPrefsSchema>;

export async function getPrefs(userId: string): Promise<NotifyPrefs> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { notifyPrefs: true } });
  return notifyPrefsSchema.parse(u?.notifyPrefs ?? {});
}

export async function setPrefs(userId: string, input: unknown): Promise<NotifyPrefs> {
  const prefs = notifyPrefsSchema.parse(input);
  await prisma.user.update({ where: { id: userId }, data: { notifyPrefs: prefs as object } });
  return prefs;
}

export interface DealFacts {
  score: number;
  band: string;
  netProfitCents: number;
  profileId: string;
}

/** Beslist of deze deal voor deze gebruiker een melding mag worden. */
export function passesPrefs(p: NotifyPrefs, d: DealFacts): { ok: boolean; reason?: string } {
  if (p.mode === "top" && d.band !== "TOP") return { ok: false, reason: "Alleen topdeals ingesteld" };
  if (p.minScore != null && d.score < p.minScore) return { ok: false, reason: `Score ${d.score} < minimum ${p.minScore}` };
  if (p.minProfitEuro != null && d.netProfitCents < p.minProfitEuro * 100) return { ok: false, reason: `Winst onder minimum €${p.minProfitEuro}` };
  if (p.profileIds.length && !p.profileIds.includes(d.profileId)) return { ok: false, reason: "Zoekprofiel niet geselecteerd voor meldingen" };
  return { ok: true };
}

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

function localMinutes(now: Date, tz = "Europe/Amsterdam"): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const h = Number(parts.find((x) => x.type === "hour")?.value ?? 0) % 24;
  return h * 60 + Number(parts.find((x) => x.type === "minute")?.value ?? 0);
}

/** Tijdstip waarop de stilteperiode eindigt (null = nu geen stilte). */
export function quietEndsAt(p: NotifyPrefs, now = new Date()): Date | null {
  if (!p.quiet.enabled) return null;
  const s = toMin(p.quiet.start);
  const e = toMin(p.quiet.end);
  if (s === e) return null;
  const cur = localMinutes(now);
  const inQuiet = s < e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inQuiet) return null;
  const delta = (e - cur + 1440) % 1440;
  return new Date(now.getTime() + (delta || 1) * 60_000);
}
