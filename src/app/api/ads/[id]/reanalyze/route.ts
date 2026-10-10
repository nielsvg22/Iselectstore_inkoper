import { HttpError } from "@/lib/auth";
import { routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { analyzeAd } from "@/lib/pipeline/analyze";

/** Herberekent direct (synchroon) zodat de gebruiker meteen het resultaat ziet. */
export const POST = routeP<{ id: string }>(async (_req, { params }) => {
  const ad = await prisma.advertisement.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!ad) throw new HttpError(404, "Advertentie niet gevonden");
  const r = await analyzeAd(ad.id);
  return { ok: true, score: r?.score ?? null, blocked: r?.blocked ?? false };
});
