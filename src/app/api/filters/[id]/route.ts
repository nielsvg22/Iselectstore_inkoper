import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { savedFilterInput } from "@/lib/saved-filter-schema";

async function own(id: string, userId: string) {
  const f = await prisma.savedFilter.findUnique({ where: { id } });
  if (!f || f.userId !== userId) throw new HttpError(404, "Filter niet gevonden");
  return f;
}

export const PUT = routeP<{ id: string }>(async (req, { params, user }) => {
  const f = await own(params.id, user.id);
  const body = await readJson(req, savedFilterInput);
  try {
    await prisma.savedFilter.update({ where: { id: f.id }, data: { name: body.name, tree: body.tree as unknown as Prisma.InputJsonValue } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Je hebt al een filter met deze naam");
    throw e;
  }
  return { ok: true };
});

export const DELETE = routeP<{ id: string }>(async (_req, { params, user }) => {
  const f = await own(params.id, user.id);
  await prisma.savedFilter.delete({ where: { id: f.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "filter.delete", entity: "SavedFilter", entityId: f.id } });
  return { ok: true };
});
