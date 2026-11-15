import { prisma } from "../db/client";
import { provisionVintedRadar } from "../vinted-radar";
import { APELDOORN_RADAR_NAME } from "./apeldoorn";

export interface Platforms { marktplaats: boolean; vinted: boolean }

const KEY = "platforms:env";

/**
 * ACTIVE_PLATFORMS in de omgeving (bijv. Coolify): welke platformen zoeken.
 * "vinted", "marktplaats", "marktplaats,vinted" of "geen". Leeg of niet gezet = niets doen (de app bepaalt zelf).
 * Een onbekend woord zorgt dat de hele waarde wordt genegeerd, zodat een typefout nooit per ongeluk alles aan- of uitzet.
 */
export function parsePlatforms(raw: string | undefined): Platforms | null {
  if (raw == null || raw.trim() === "") return null;
  const tokens = raw.toLowerCase().split(/[\s,;+]+/).filter(Boolean);
  if (!tokens.length) return null;
  const ok = new Set(["marktplaats", "vinted", "geen", "none"]);
  if (tokens.some((t) => !ok.has(t))) return null;
  return { marktplaats: tokens.includes("marktplaats"), vinted: tokens.includes("vinted") };
}

export interface PlatformSwitchResult { applied: boolean; reason: string; platforms?: Platforms }

/**
 * Zet de platformen zoals ACTIVE_PLATFORMS zegt, één keer per wijziging van de waarde. Daarna kan een beheerder in de app nog
 * bijsturen (pauzeren/activeren, "Vinted aan"); pas een nieuwe waarde in de omgeving schakelt opnieuw.
 * Marktplaats uit = het vaste profiel pauzeren (niet verwijderen); Vinted aan = de Vinted-radar aanzetten (maakt het profiel aan als dat nog niet bestaat).
 */
export async function applyPlatformEnv(userId: string, raw: string | undefined = process.env.ACTIVE_PLATFORMS): Promise<PlatformSwitchResult> {
  const want = parsePlatforms(raw);
  if (!want) return { applied: false, reason: raw?.trim() ? "onbekende waarde genegeerd" : "niet ingesteld" };
  const value = `${want.marktplaats ? "marktplaats" : ""}+${want.vinted ? "vinted" : ""}`;
  const done = await prisma.appSettings.findUnique({ where: { key: KEY } });
  if ((done?.value as { value?: string } | null)?.value === value) return { applied: false, reason: "al toegepast", platforms: want };
  // pas na de eerste inrichting van het vaste profiel, anders ontstaat er een tweede
  if (!(await prisma.appSettings.findUnique({ where: { key: "provision:smart-radar-v2" } }))) return { applied: false, reason: "wacht op inrichting" };
  const radar = await prisma.searchProfile.findFirst({ where: { userId, name: APELDOORN_RADAR_NAME } });
  if (!radar) return { applied: false, reason: "wacht op zoekprofiel" };
  await prisma.searchProfile.update({ where: { id: radar.id }, data: { active: want.marktplaats } });
  await provisionVintedRadar(userId, { enabled: want.vinted });
  await prisma.appSettings.upsert({ where: { key: KEY }, create: { key: KEY, value: { value, at: new Date().toISOString() } }, update: { value: { value, at: new Date().toISOString() } } });
  await prisma.auditLog.create({ data: { userId, action: "platforms.env", entity: "Rules", meta: { marktplaats: want.marktplaats, vinted: want.vinted } } });
  return { applied: true, reason: "toegepast", platforms: want };
}
