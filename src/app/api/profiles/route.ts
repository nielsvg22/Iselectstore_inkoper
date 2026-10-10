import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { saveTree } from "@/lib/pipeline/tree";
import { profileInput } from "@/lib/profile-schema";

export const GET = route(async (_req, { user }) => {
  const profiles = await prisma.searchProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return { profiles };
});

export const POST = route(async (req, { user }) => {
  const { tree, ...input } = await readJson(req, profileInput);
  const p = await prisma.searchProfile.create({ data: { ...input, sourceConfig: input.sourceConfig as object, userId: user.id } });
  await saveTree(p.id, tree);
  await prisma.auditLog.create({ data: { userId: user.id, action: "profile.create", entity: "SearchProfile", entityId: p.id } });
  return { id: p.id };
});
