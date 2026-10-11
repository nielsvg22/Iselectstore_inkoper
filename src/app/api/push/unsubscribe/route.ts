import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";

export const POST = route(async (req, { user }) => {
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string().url().max(1000) }));
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
});
