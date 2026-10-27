import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { provisionVintedRadar, vintedRadarInput, vintedStatus } from "@/lib/vinted-radar";

export const GET = route(async (_req, { user }) => ({ status: await vintedStatus(user.id) }));

/** Zet de Vinted-radar aan/uit en maakt of werkt het Vinted-zoekprofiel bij. Alleen beheerders. Idempotent. */
export const POST = route(
  async (req, { user }) => {
    const input = await readJson(req, vintedRadarInput);
    const r = await provisionVintedRadar(user.id, input);
    await prisma.auditLog.create({ data: { userId: user.id, action: "profile.vinted-radar", entity: "SearchProfile", entityId: r.id, meta: { enabled: input.enabled ?? null } } });
    return { ...r, status: await vintedStatus(user.id) };
  },
  { admin: true },
);
