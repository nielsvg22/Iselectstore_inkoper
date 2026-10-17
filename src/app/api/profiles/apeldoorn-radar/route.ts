import { route } from "@/lib/api";
import { installApeldoornRadar } from "@/lib/radar/provision";

/** Eenmalige, expliciete vervanging; back-up gebeurt vóór verwijderen. */
export const POST = route(
  async (_req, { user }) => await installApeldoornRadar(user.id),
  { admin: true },
);

export const GET = route(
  async (_req, { user }) => {
    const { prisma } = await import("@/lib/db/client");
    return prisma.appSettings.findMany({
      where: { key: { startsWith: `backup:profiles:${user.id}:` } },
      orderBy: { key: "desc" },
    });
  },
  { admin: true },
);

export const PATCH = route(
  async (req, { user }) => {
    const { readJson } = await import("@/lib/api");
    const { z } = await import("zod");
    const { restoreRadarProfiles } = await import("@/lib/radar/provision");
    const body = await readJson(
      req,
      z.object({ backupKey: z.string().max(300) }),
    );
    return restoreRadarProfiles(user.id, body.backupKey);
  },
  { admin: true },
);
