import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";

/** Eigen apparaten (zonder endpoint/sleutels). */
export const GET = route(async (_req, { user }) => ({
  devices: await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, enabled: true, failures: true, lastSuccessAt: true, lastFailureAt: true, lastError: true, createdAt: true },
  }),
}));
