import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { loadTree, saveTree } from "@/lib/pipeline/tree";
import { profileInput } from "@/lib/profile-schema";

async function own(id: string, userId: string) {
  const p = await prisma.searchProfile.findUnique({ where: { id } });
  if (!p || p.userId !== userId) throw new HttpError(404, "Zoekprofiel niet gevonden");
  return p;
}

export const GET = routeP<{ id: string }>(async (_req, { params, user }) => {
  const p = await own(params.id, user.id);
  return { profile: p, tree: await loadTree(p.id) };
});

export const PUT = routeP<{ id: string }>(async (req, { params, user }) => {
  const p = await own(params.id, user.id);
  const { tree, ...input } = await readJson(req, profileInput);
  await prisma.searchProfile.update({ where: { id: p.id }, data: { ...input, sourceConfig: input.sourceConfig as object } });
  await saveTree(p.id, tree);
  await prisma.auditLog.create({ data: { userId: user.id, action: "profile.update", entity: "SearchProfile", entityId: p.id } });
  return { ok: true };
});

export const DELETE = routeP<{ id: string }>(async (_req, { params, user }) => {
  const p = await own(params.id, user.id);
  await prisma.searchProfile.delete({ where: { id: p.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "profile.delete", entity: "SearchProfile", entityId: p.id } });
  return { ok: true };
});
