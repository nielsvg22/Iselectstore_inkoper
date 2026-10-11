import { z } from "zod";
import { readJson, routeP } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

async function own(id: string, userId: string) {
  const d = await prisma.pushSubscription.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!d || d.userId !== userId) throw new HttpError(404, "Apparaat niet gevonden");
}

export const PATCH = routeP<{ id: string }>(async (req, { params, user }) => {
  await own(params.id, user.id);
  const b = await readJson(req, z.object({ enabled: z.boolean().optional(), label: z.string().trim().max(60).optional() }));
  await prisma.pushSubscription.update({ where: { id: params.id }, data: { ...b, ...(b.enabled ? { failures: 0 } : {}) } });
  return { ok: true };
});

export const DELETE = routeP<{ id: string }>(async (_req, { params, user }) => {
  await own(params.id, user.id);
  await prisma.pushSubscription.delete({ where: { id: params.id } });
  return { ok: true };
});
