import { createHash } from "node:crypto";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { rateLimit } from "@/lib/security/ratelimit";

const body = z.object({ endpointId: z.string().regex(/^[0-9a-f]{16}$/), ok: z.boolean(), error: z.string().max(200).optional() });

/** De service worker meldt na elke push of de browser de melding echt heeft getoond (ok) of waarom niet (error). */
export const POST = route(async (req, { user }) => {
  if (!rateLimit(`push-ack:${user.id}`, 300, 60_000).ok) return { ok: false };
  const b = await readJson(req, body);
  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id }, select: { id: true, endpoint: true } });
  const sub = subs.find((s) => createHash("sha256").update(s.endpoint).digest("hex").slice(0, 16) === b.endpointId);
  if (!sub) return { ok: false };
  await prisma.pushSubscription.update({ where: { id: sub.id }, data: b.ok ? { lastShownAt: new Date(), lastShowError: null } : { lastShowError: (b.error ?? "onbekende fout").slice(0, 200) } });
  return { ok: true };
});
