import { prisma } from "../db/client";
import { saveConfig } from "../settings/store";
import { generateDemoAds, generateDemoComparables } from "../sources/demo-data";
import { analyzeAd } from "./analyze";
import { ingestAd } from "./ingest";

/** Laadt duidelijk gemarkeerde voorbeelddata (isDemo = true) en analyseert die direct. */
export async function loadDemoData(): Promise<{ ads: number; comparables: number }> {
  await prisma.marketComparable.deleteMany({ where: { isDemo: true, sourceAdId: null } });
  const comps = generateDemoComparables();
  await prisma.marketComparable.createMany({ data: comps.map((c) => ({ ...c, source: "demo", isDemo: true, variantKey: "" })) });
  const ads = generateDemoAds();
  const ids: string[] = [];
  for (const raw of ads) {
    const r = await ingestAd(raw, { origin: "DEMO", isDemo: true, enqueueAnalysis: false });
    ids.push(r.adId);
  }
  // Analyseer in twee rondes zodat vergelijkingsdata van de demo-advertenties zelf ook meetelt
  for (const id of ids) await analyzeAd(id);
  for (const id of ids) await analyzeAd(id);
  await saveConfig({ demoMode: true });
  return { ads: ads.length, comparables: comps.length };
}

export async function removeDemoData(): Promise<{ removed: number }> {
  const r = await prisma.advertisement.deleteMany({ where: { isDemo: true } });
  await prisma.marketComparable.deleteMany({ where: { isDemo: true } });
  await saveConfig({ demoMode: false });
  return { removed: r.count };
}
