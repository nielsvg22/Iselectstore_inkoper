import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db/client";
import { getConfig, getSecret } from "../settings/store";
import { SourceError, type RawAd, type SourceAdapter } from "./types";

export const OFFICIAL_SOURCE = "marktplaats-official";
const API = "https://api.marktplaats.nl";
export const tokenFingerprint = (token: string) => createHash("sha256").update(token).digest("hex");

// The documented search representation has no guaranteed publication timestamp,
// coordinates, shipping, review scale or account creation date. Unknown stays unknown.
const resultSchema = z.object({
  itemId: z.string().regex(/^m\d+$/),
  title: z.string().optional(), description: z.string().optional(),
  translations: z.array(z.object({ locale: z.string(), title: z.string().optional(), description: z.string().optional() })).optional(),
  priceModel: z.object({ askingPrice: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }).optional(),
  seller: z.object({ sellerId: z.union([z.number().int(), z.string()]).optional(), sellerName: z.string().optional() }).optional(),
});

export function parseOfficialResults(body: unknown): RawAd[] {
  const envelope = z.object({ _embedded: z.object({ "mp:search-result": z.array(z.unknown()) }) }).safeParse(body);
  if (!envelope.success) throw new SourceError("Marktplaats API: onverwacht zoekresultaatformaat", false);
  const ads: RawAd[] = [];
  for (const entry of envelope.data._embedded["mp:search-result"]) {
    const parsed = resultSchema.safeParse(entry);
    if (!parsed.success) continue;
    const r = parsed.data;
    const translated = r.translations?.find(t => t.locale === "nl-NL");
    const title = r.title ?? translated?.title;
    if (!title?.trim()) continue;
    ads.push({
      externalId: r.itemId, url: `https://link.marktplaats.nl/${r.itemId}`,
      title, description: r.description ?? translated?.description,
      askingCents: r.priceModel?.askingPrice,
      seller: r.seller ? { id: r.seller.sellerId == null ? undefined : String(r.seller.sellerId), name: r.seller.sellerName } : undefined,
      imageUrls: [], attributes: { detectionSource: OFFICIAL_SOURCE, publicationPrecision: "unknown" },
    });
  }
  return ads;
}

/** No redirects, arbitrary HAL links, token query parameters or response bodies in errors. */
export async function officialSearch(token: string, query: string, limit: number, fetchImpl: typeof fetch = fetch): Promise<RawAd[]> {
  const url = new URL("/v2/search", API);
  url.search = new URLSearchParams({ query, searchDescription: "true", limit: String(Math.max(1, Math.min(200, limit))), offset: "0", locale: "nl-NL" }).toString();
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { method: "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json, application/json" }, signal: AbortSignal.timeout(15000) });
  } catch { throw new SourceError("Marktplaats API: netwerkfout of timeout"); }
  if (!res.ok) {
    const raw = res.headers.get("retry-after");
    const retry = raw ? (/^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now()) : 0;
    // Persisted by the adapter, not retried inline. Never expose provider bodies/tokens.
    throw new OfficialHttpError(res.status, Number.isFinite(retry) ? Math.max(0, retry) : 0);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new SourceError("Marktplaats API: lege response", false);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) throw new SourceError("Marktplaats API: response te groot", false);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let json: unknown;
  try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new SourceError("Marktplaats API: ongeldige JSON", false); }
  return parseOfficialResults(json);
}

export class OfficialHttpError extends SourceError {
  constructor(public status: number, public retryAfterMs = 0) {
    super(`Marktplaats API HTTP ${status}${status === 401 ? ": eigen OAuth-token ontbreekt of is verlopen" : status === 403 ? ": zoektoegang geweigerd" : ""}`, status === 429 || status >= 500);
  }
}

type GateState = { nextAt?: number; blockedFingerprint?: string; status?: number };
export async function officialGateState(): Promise<GateState> {
  const row = await prisma.appSettings.findUnique({ where: { key: `source:${OFFICIAL_SOURCE}:gate` } });
  return (row?.value as GateState | undefined) ?? {};
}

/** A separate durable limit; 401/403 pauses this credential until it is replaced.
 * A 429 respects Retry-After (with a conservative 15 minute minimum).
 */
async function claimOfficialSlot(token: string, requestsPerMinute: number) {
  const now = Date.now(); const fingerprint = tokenFingerprint(token);
  const claimed = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('marktplaats-official-gate'))`;
    const key = `source:${OFFICIAL_SOURCE}:gate`;
    const row = await tx.appSettings.findUnique({ where: { key } });
    const prev = (row?.value as GateState | undefined) ?? {};
    if (prev.blockedFingerprint === fingerprint) throw new SourceError(`Marktplaats API gepauzeerd na HTTP ${prev.status}; vervang of herautoriseer het eigen OAuth-token`, false);
    if ((prev.nextAt ?? 0) > now) return false;
    const value = { nextAt: now + 60000 / requestsPerMinute };
    await tx.appSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
    return true;
  });
  if (!claimed) throw new SourceError("Marktplaats API wacht op zijn volgende requestslot", false);
}

export async function officialReady() {
  const cfg = (await getConfig()).officialApi;
  if (!cfg.enabled || !cfg.accessApproved) return false;
  const token = await getSecret("marktplaats.accessToken");
  if (!token) return false;
  const gate = await officialGateState();
  return gate.blockedFingerprint !== tokenFingerprint(token) && (gate.nextAt ?? 0) <= Date.now();
}

export const officialAdapter: SourceAdapter = {
  id: OFFICIAL_SOURCE, label: "Marktplaats Search API (vereist eigen OAuth-toegang)", origin: "PARTNER_API",
  automatic: true, minIntervalMinutes: 1,
  description: "Gedocumenteerde GET /v2/search; alleen na goedgekeurde toegang en met een eigen Marktplaats OAuth-token. GoedGeplaatst-autorisatie geeft geen automatische zoekrechten.",
  async fetchProfile(ctx) {
    const cfg = (await getConfig()).officialApi;
    if (!cfg.enabled || !cfg.accessApproved) throw new SourceError("Marktplaats Search API staat uit of zoektoegang is niet bevestigd", false);
    const token = await getSecret("marktplaats.accessToken");
    if (!token) throw new SourceError("Geen eigen Marktplaats OAuth-token ingesteld", false);
    await claimOfficialSlot(token, cfg.requestsPerMinute);
    const queries = Array.isArray(ctx.config.queries) ? ctx.config.queries.filter((q): q is string => typeof q === "string" && !!q.trim()) : [ctx.query];
    // One broad boolean query instead of dozens of model/storage requests. No undocumented date sorting.
    const query = queries.length > 1 ? queries.map(q => `(${q})`).join(" or ") : queries[0];
    if (!query || query.length > 2000) throw new SourceError("Ongeldige API-zoekopdracht", false);
    try {
      if (ctx.stats) ctx.stats.pages++;
      const ads = (await officialSearch(token, query, Math.min(cfg.pageSize, ctx.maxAds), ctx.fetchImpl)).filter(a => !ctx.prefilter || ctx.prefilter(a));
      if (ctx.stats) ctx.stats.covered = ads.length;
      await ctx.onAds?.(ads);
      return ads;
    } catch (e) {
      if (e instanceof OfficialHttpError && [401, 403, 429].includes(e.status)) {
        const key = `source:${OFFICIAL_SOURCE}:gate`;
        const value = { nextAt: Date.now() + Math.max(900000, e.retryAfterMs), status: e.status,
          ...([401, 403].includes(e.status) ? { blockedFingerprint: tokenFingerprint(token) } : {}) };
        await prisma.appSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
      }
      throw e;
    }
  },
};
