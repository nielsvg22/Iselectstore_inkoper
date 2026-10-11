import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";

/** Alles in een categorie (bijv. alle iPhone-modellen) tegelijk aan- of uitzetten. */
export const POST = route(async (req, { user }) => {
  const { group, active } = await readJson(req, z.object({ group: z.string().min(1).max(60), active: z.boolean() }));
  const r = await prisma.searchProfile.updateMany({ where: { userId: user.id, sourceConfig: { path: ["group"], equals: group } }, data: { active } });
  await prisma.auditLog.create({ data: { userId: user.id, action: active ? "profile.group.enable" : "profile.group.disable", meta: { group, count: r.count } } });
  return { updated: r.count };
});
