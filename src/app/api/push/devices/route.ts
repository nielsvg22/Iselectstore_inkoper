import { createHash } from "node:crypto";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";

/** Eigen apparaten. Het endpoint zelf en de sleutels komen nooit terug; `endpointId` is een korte vingerafdruk waarmee de browser zijn eigen apparaat herkent. */
export const GET = route(async (_req, { user }) => {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, endpoint: true, label: true, enabled: true, failures: true, lastSuccessAt: true, lastFailureAt: true, lastError: true, lastShownAt: true, lastShowError: true, createdAt: true },
  });
  return { devices: rows.map(({ endpoint, ...d }) => ({ ...d, endpointId: createHash("sha256").update(endpoint).digest("hex").slice(0, 16) })) };
});
