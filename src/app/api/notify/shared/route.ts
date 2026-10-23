import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { setSharedNotifyUsers, sharedNotifyUserIds } from "@/lib/notify/shared";

export const GET = route(async () => ({ userIds: await sharedNotifyUserIds() }), { admin: true });

/** Beheerder bepaalt welke accounts de dealmeldingen van de radar meekrijgen. */
export const PUT = route(async (req, { user }) => {
  const { userIds } = await readJson(req, z.object({ userIds: z.array(z.string().max(40)).max(200) }));
  const ids = await setSharedNotifyUsers(userIds);
  await prisma.auditLog.create({ data: { userId: user.id, action: "notify.shared_users_changed", meta: { count: ids.length } } });
  return { userIds: ids };
}, { admin: true });
