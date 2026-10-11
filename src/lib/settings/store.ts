import { prisma } from "../db/client";
import { configSchema, defaultConfig, SECRET_KEYS, type AppConfig, type SecretKey } from "../config/schema";
import { decryptSecret, encryptSecret } from "../security/crypto";

let cache: { at: number; cfg: AppConfig } | null = null;
const TTL = 3000;

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (Array.isArray(patch) || patch === null || typeof patch !== "object" || typeof base !== "object" || base === null || Array.isArray(base)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  return out as T;
}

export async function getConfig(fresh = false): Promise<AppConfig> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.cfg;
  const row = await prisma.appSettings.findUnique({ where: { key: "config" } });
  const cfg = configSchema.parse(row?.value ?? {});
  cache = { at: Date.now(), cfg };
  return cfg;
}

export async function saveConfig(patch: unknown): Promise<AppConfig> {
  const current = await getConfig(true);
  const merged = configSchema.parse(deepMerge(current, patch));
  await prisma.appSettings.upsert({ where: { key: "config" }, create: { key: "config", value: merged as object }, update: { value: merged as object } });
  cache = { at: Date.now(), cfg: merged };
  return merged;
}

export function resetConfigCache() {
  cache = null;
}

const ENV_FALLBACK: Record<SecretKey, string> = {
  "ai.apiKey": "AI_API_KEY",
  "telegram.botToken": "TELEGRAM_BOT_TOKEN",
  "discord.webhookUrl": "DISCORD_WEBHOOK_URL",
  "imap.password": "IMAP_PASSWORD",
};

export async function getSecret(key: SecretKey): Promise<string | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: `secret:${key}` } });
  if (row) {
    try {
      return decryptSecret((row.value as { enc: string }).enc);
    } catch {
      return null;
    }
  }
  return process.env[ENV_FALLBACK[key]] || null;
}

export async function setSecret(key: SecretKey, value: string | null): Promise<void> {
  if (!SECRET_KEYS.includes(key)) throw new Error("Onbekende geheime sleutel");
  const k = `secret:${key}`;
  if (value === null || value === "") {
    await prisma.appSettings.deleteMany({ where: { key: k } });
    return;
  }
  const v = { enc: encryptSecret(value) };
  await prisma.appSettings.upsert({ where: { key: k }, create: { key: k, value: v, secret: true }, update: { value: v } });
}

export interface SecretStatus {
  key: SecretKey;
  isSet: boolean;
  via: "database" | "environment" | null;
}

/** Alleen aanwezigheid; nooit de waarde. */
export async function secretStatus(): Promise<SecretStatus[]> {
  const rows = await prisma.appSettings.findMany({ where: { key: { in: SECRET_KEYS.map((k) => `secret:${k}`) } }, select: { key: true } });
  const have = new Set(rows.map((r) => r.key));
  return SECRET_KEYS.map((key) => {
    if (have.has(`secret:${key}`)) return { key, isSet: true, via: "database" as const };
    if (process.env[ENV_FALLBACK[key]]) return { key, isSet: true, via: "environment" as const };
    return { key, isSet: false, via: null };
  });
}

export { defaultConfig };
