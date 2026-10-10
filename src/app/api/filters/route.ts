import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { savedFilterInput } from "@/lib/saved-filter-schema";

export const GET = route(async (_req, { user }) => ({ filters: await prisma.savedFilter.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }) }));

export const POST = route(async (req, { user }) => {
  const body = await readJson(req, savedFilterInput);
  try {
    const f = await prisma.savedFilter.create({ data: { userId: user.id, name: body.name, tree: body.tree as unknown as Prisma.InputJsonValue } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "filter.create", entity: "SavedFilter", entityId: f.id } });
    return { id: f.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Je hebt al een filter met deze naam");
    throw e;
  }
});
