import { prisma } from "../db/client";

const KEY = "wipe:results";

export interface WipeResult { applied: boolean; reason: string; deletedAds?: number; resetProfiles?: number }

/** Alleen een herkenbaar label (letters, cijfers, punt, streep); een leeg of vreemd label doet niets. */
export const parseWipeToken = (raw: string | undefined): string | null => {
  const t = raw?.trim() ?? "";
  return /^[A-Za-z0-9._-]{1,64}$/.test(t) ? t : null;
};

/**
 * WIPE_RESULTS=<label> in de omgeving (alleen testomgeving): wist één keer per nieuw label alle gevonden advertenties.
 * Verwijderd: advertenties met hun foto's, analyses, meldinghistorie en profielkoppelingen (cascade), en nog wachtende
 * analyse-/detail-/meldingstaken. De nulmeting en de zoekvoortgang van de profielen worden teruggezet, zodat de eerste ronde
 * daarna weer niets meldt. Blijft staan: inkopen en verkopen (alleen de koppeling aan de advertentie vervalt), modellenlijst,
 * inkoopregels, zoekprofielen, instellingen, accounts en pushapparaten.
 */
export async function applyWipeResults(raw: string | undefined = process.env.WIPE_RESULTS): Promise<WipeResult> {
  const token = parseWipeToken(raw);
  if (!token) return { applied: false, reason: raw?.trim() ? "ongeldig label genegeerd" : "niet ingesteld" };
  const done = await prisma.appSettings.findUnique({ where: { key: KEY } });
  if ((done?.value as { token?: string } | null)?.token === token) return { applied: false, reason: "al uitgevoerd" };

  const deleted = await prisma.advertisement.deleteMany({});
  await prisma.backgroundJob.deleteMany({ where: { type: { in: ["ANALYZE_AD", "FETCH_DETAIL", "NOTIFY"] }, status: "PENDING" } });
  await prisma.appSettings.deleteMany({ where: { OR: [{ key: { startsWith: "slice:state:" } }, { key: { startsWith: "slice:full:" } }] } });

  // nulmeting terugzetten: de eerste geslaagde controle erna legt hem opnieuw vast
  let resetProfiles = 0;
  for (const p of await prisma.searchProfile.findMany({ select: { id: true, sourceConfig: true } })) {
    const sc = (p.sourceConfig ?? {}) as Record<string, unknown>;
    if (!("baselineAt" in sc)) continue;
    const { baselineAt: _b, ...rest } = sc;
    await prisma.searchProfile.update({ where: { id: p.id }, data: { sourceConfig: rest as object, lastCheckedAt: null, lastSuccessAt: null, discoveredCount: 0, interestingCount: 0 } });
    resetProfiles++;
  }
  await prisma.appSettings.upsert({ where: { key: KEY }, create: { key: KEY, value: { token, at: new Date().toISOString(), deletedAds: deleted.count } }, update: { value: { token, at: new Date().toISOString(), deletedAds: deleted.count } } });
  await prisma.auditLog.create({ data: { userId: null, action: "results.wiped", entity: "Advertisement", meta: { token, deletedAds: deleted.count, resetProfiles } } });
  return { applied: true, reason: "uitgevoerd", deletedAds: deleted.count, resetProfiles };
}
