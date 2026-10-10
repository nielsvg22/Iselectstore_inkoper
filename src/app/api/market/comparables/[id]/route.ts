import { routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";

export const DELETE = routeP<{ id: string }>(async (_req, { params }) => {
  await prisma.marketComparable.deleteMany({ where: { id: params.id, sourceAdId: null } });
  return { ok: true };
});
