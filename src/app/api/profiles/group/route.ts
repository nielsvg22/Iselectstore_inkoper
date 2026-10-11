import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";

/** Alles in een categorie (bijv. alle iPhone-modellen) of in een onderdeel daarvan (bijv. iPhone 15) tegelijk aan- of uitzetten. */
export const POST = route(async (req, { user }) => {
  const { group, subgroup, active } = await readJson(req, z.object({ group: z.string().min(1).max(60), subgroup: z.string().min(1).max(60).optional(), active: z.boolean() }));
  const r = await prisma.searchProfile.updateMany({ where: { userId: user.id, AND: [{ sourceConfig: { path: ["group"], equals: group } }, ...(subgroup ? [{ sourceConfig: { path: ["subgroup"], equals: subgroup } }] : [])] }, data: { active } });
  await prisma.auditLog.create({ data: { userId: user.id, action: active ? "profile.group.enable" : "profile.group.disable", meta: { group, subgroup: subgroup ?? null, count: r.count } } });
  return { updated: r.count };
});
