import { prisma } from "../db/client";

const KEY = "notify:shared-users";

/**
 * Accounts die de dealmeldingen van de radar ook ontvangen, naast de eigenaar van het zoekprofiel.
 * Door één radar te delen blijft het aantal verzoeken naar Marktplaats gelijk. Alleen een beheerder kan dit instellen.
 */
export async function sharedNotifyUserIds(): Promise<string[]> {
  const row = await prisma.appSettings.findUnique({ where: { key: KEY } });
  const ids = (row?.value as { userIds?: unknown } | null)?.userIds;
  if (!Array.isArray(ids) || !ids.length) return [];
  const valid = await prisma.user.findMany({ where: { id: { in: ids.filter((x): x is string => typeof x === "string") } }, select: { id: true } });
  return valid.map((u) => u.id);
}

export async function setSharedNotifyUsers(userIds: string[]): Promise<string[]> {
  const valid = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
  const ids = valid.map((u) => u.id);
  await prisma.appSettings.upsert({ where: { key: KEY }, create: { key: KEY, value: { userIds: ids } }, update: { value: { userIds: ids } } });
  return ids;
}
