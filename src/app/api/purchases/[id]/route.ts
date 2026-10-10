import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { purchaseInput } from "@/lib/purchase-schema";

async function own(id: string, userId: string) {
  const p = await prisma.purchase.findUnique({ where: { id } });
  if (!p || p.userId !== userId) throw new HttpError(404, "Inkoop niet gevonden");
  return p;
}

export const PATCH = routeP<{ id: string }>(async (req, { params, user }) => {
  const p = await own(params.id, user.id);
  const body = await readJson(req, purchaseInput.partial());
  await prisma.purchase.update({ where: { id: p.id }, data: body });
  return { ok: true };
});

export const DELETE = routeP<{ id: string }>(async (_req, { params, user }) => {
  const p = await own(params.id, user.id);
  await prisma.purchase.delete({ where: { id: p.id } });
  return { ok: true };
});
