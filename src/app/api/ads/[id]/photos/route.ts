import { HttpError } from "@/lib/auth";
import { routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { createProvider } from "@/lib/ai/provider";
import { analyzePhotos, getPhotoAnalysis } from "@/lib/ai/photos";
import { getConfig, getSecret } from "@/lib/settings/store";

export const GET = routeP<{ id: string }>(async (_req, { params }) => {
  return { analysis: await getPhotoAnalysis(params.id) };
});

/** Beoordeelt de foto's met AI (op verzoek; kost AI-budget). ?force=1 herhaalt ook bij gelijke foto's. */
export const POST = routeP<{ id: string }>(async (req, { params }) => {
  const ad = await prisma.advertisement.findUnique({ where: { id: params.id }, select: { id: true, isDemo: true } });
  if (!ad) throw new HttpError(404, "Advertentie niet gevonden");
  if (ad.isDemo) throw new HttpError(400, "Voorbeelddata heeft geen echte foto's");
  const cfg = await getConfig();
  const provider = createProvider(cfg, await getSecret("ai.apiKey"));
  const force = new URL(req.url).searchParams.get("force") === "1";
  const r = await analyzePhotos(ad.id, cfg, provider, force);
  if (!r.ok) throw new HttpError(422, r.reason);
  return { analysis: r.analysis, cached: r.cached };
});
