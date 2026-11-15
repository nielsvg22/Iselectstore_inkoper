import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { loadTree, saveTree } from "@/lib/pipeline/tree";
import { profileInput } from "@/lib/profile-schema";
import { assertCustomProfilesAllowed, customProfilesAllowed, isSystemProfile, LOCKED_MESSAGE } from "@/lib/profile-lock";
import { z } from "zod";

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
  assertCustomProfilesAllowed();
  const p = await own(params.id, user.id);
  const { tree, ...input } = await readJson(req, profileInput);
  await prisma.searchProfile.update({ where: { id: p.id }, data: { ...input, sourceConfig: input.sourceConfig as object } });
  await saveTree(p.id, tree);
  await prisma.auditLog.create({ data: { userId: user.id, action: "profile.update", entity: "SearchProfile", entityId: p.id } });
  return { ok: true };
});

/** Het enige dat bij een vast profiel mag: pauzeren of weer aanzetten (alleen beheerders). */
export const PATCH = routeP<{ id: string }>(async (req, { params, user }) => {
  const p = await own(params.id, user.id);
  if (!customProfilesAllowed() && !isSystemProfile(p)) throw new HttpError(403, LOCKED_MESSAGE);
  const { active } = await readJson(req, z.object({ active: z.boolean() }));
  await prisma.searchProfile.update({ where: { id: p.id }, data: { active } });
  await prisma.auditLog.create({ data: { userId: user.id, action: active ? "profile.resume" : "profile.pause", entity: "SearchProfile", entityId: p.id } });
  return { ok: true, active };
}, { admin: true });

export const DELETE = routeP<{ id: string }>(async (_req, { params, user }) => {
  assertCustomProfilesAllowed();
  const p = await own(params.id, user.id);
  await prisma.searchProfile.delete({ where: { id: p.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "profile.delete", entity: "SearchProfile", entityId: p.id } });
  return { ok: true };
});
