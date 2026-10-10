import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { SECRET_KEYS } from "@/lib/config/schema";
import { getConfig, saveConfig, secretStatus, setSecret } from "@/lib/settings/store";

/** Geeft nooit geheimen terug; alleen of ze zijn ingesteld. */
export const GET = route(async () => ({ config: await getConfig(true), secrets: await secretStatus() }));

const schema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.enum(SECRET_KEYS), z.string().max(500).nullable()).optional(),
});

export const PUT = route(
  async (req, { user }) => {
    const body = await readJson(req, schema);
    if (body.config) await saveConfig(body.config);
    if (body.secrets) for (const [k, v] of Object.entries(body.secrets)) await setSecret(k as (typeof SECRET_KEYS)[number], v);
    await prisma.auditLog.create({ data: { userId: user.id, action: "settings.update", meta: { config: !!body.config, secrets: Object.keys(body.secrets ?? {}) } } });
    return { config: await getConfig(true), secrets: await secretStatus() };
  },
  { admin: true },
);
