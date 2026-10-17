import { z } from "zod";
import { hiRes, mergeImages } from "../images";
import { prisma } from "../db/client";
import { Throttle } from "../security/ratelimit";
import { getConfig } from "../settings/store";
import { fetchListingUrl } from "./adapters-shared";
import { safeFetch } from "./safe-fetch";
import { SourceError, type FetchContext, type RawAd, type SourceAdapter } from "./types";

/**
 * Zoeken op Marktplaats via de gewone, publieke zoek-/categoriepagina's
 *   https://www.marktplaats.nl/q/<zoekterm>/                       (alle categorieën)
 *   https://www.marktplaats.nl/l/<categorie>/q/<zoekterm>/p/<n>/   (categorie + pagina)
 * Deze paden staan NIET in de Disallow-lijst van robots.txt (gecontroleerd op 2026-10-10).
 * Bewust NIET gebruikt: /lrp/api/search*, /lp/api/listings*, /search?q=* — die verbiedt robots.txt.
 * De pagina's bevatten de resultaten als ingebedde JSON (__NEXT_DATA__); filters (prijs, afstand,
 * model, winst …) worden daarna door deze app zelf toegepast.
 */
export const MARKTPLAATS_ORIGIN = "https://www.marktplaats.nl";
export const PAGE_SIZE = 30;

export const searchConfigSchema = z.object({
  queries: z.array(z.string().trim().min(2).max(80)).min(1, "Voer minstens één zoekterm in").max(10),
  /** bijv. telecommunicatie/mobiele-telefoons-apple-iphone — leeg = alle categorieën */
  category: z
    .string()
    .regex(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/, "Ongeldig categoriepad")
    .optional()
    .or(z.literal("")),
  maxPages: z.number().int().min(1).max(10).default(3),
  fetchDetails: z.boolean().default(true),
});
export type SearchConfig = z.infer<typeof searchConfigSchema>;

export { KNOWN_CATEGORIES } from "./search-categories";

export function buildSearchUrl(query: string, category: string | undefined, page: number): string {
  // Alleen letters, cijfers, spaties en koppeltekens: voorkomt padmanipulatie of parameter-injectie
  const clean = query.toLowerCase().replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/\s+/g, " ").trim();
  const q = encodeURIComponent(clean).replace(/%20/g, "+");
  const base = category ? `${MARKTPLAATS_ORIGIN}/l/${category}/q/${q}/` : `${MARKTPLAATS_ORIGIN}/q/${q}/`;
  return page > 1 ? `${base}p/${page}/` : base;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };

/** "Vandaag" / "Gisteren" / "Eergisteren" / "5 okt." / "12 mrt. '25" → bij benadering een datum. */
export function parseListingDate(label: unknown, now = new Date()): Date | null {
  if (typeof label !== "string") return null;
  const t = label.trim().toLowerCase();
  const day = 86400000;
  if (t === "vandaag") return now;
  if (t === "gisteren") return new Date(now.getTime() - day);
  if (t === "eergisteren") return new Date(now.getTime() - 2 * day);
  const m = /^(\d{1,2})\s+([a-z]{3})\.?(?:\s+'?(\d{2,4}))?$/.exec(t);
  if (!m || !(m[2] in MONTHS)) return null;
  let year = now.getFullYear();
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  let d = new Date(Date.UTC(year, MONTHS[m[2]], Number(m[1]), 12));
  if (!m[3] && d.getTime() > now.getTime() + day) d = new Date(Date.UTC(year - 1, MONTHS[m[2]], Number(m[1]), 12));
  return d;
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const absImg = (u: string) => (u.startsWith("//") ? "https:" + u : u);

function attrMap(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(list)) {
    for (const a of list as Obj[]) {
      const k = str(a.key);
      const v = str(a.value);
      if (k && v) out[k.toLowerCase()] = v;
    }
  }
  return out;
}

const NO_PRICE = new Set(["SEE_DESCRIPTION", "ON_REQUEST", "EXCHANGE", "RESERVED", "NOTK", "FAST_BID"]);

export function mapSearchListing(o: Obj, now = new Date()): RawAd | null {
  const id = str(o.itemId);
  const title = str(o.title);
  const vip = str(o.vipUrl);
  if (!id || !title || !vip || o.reserved === true) return null;
  const pi = (o.priceInfo ?? {}) as Obj;
  const priceType = str(pi.priceType) ?? "";
  const cents = typeof pi.priceCents === "number" && !NO_PRICE.has(priceType) ? Math.round(pi.priceCents) : null;
  const loc = (o.location ?? {}) as Obj;
  const attrs = { ...attrMap(o.attributes), ...attrMap(o.extendedAttributes) };
  const delivery = (attrs.delivery ?? "").toLowerCase();
  const shipping: string[] = [];
  if (delivery.includes("ophalen")) shipping.push("pickup");
  if (delivery.includes("verzend")) shipping.push("shipping");
  const dist = typeof loc.distanceMeters === "number" && loc.distanceMeters >= 0 ? loc.distanceMeters / 1000 : null;
  const structured: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) if (k !== "delivery") structured[k] = v;
  if (priceType) structured.priceType = priceType;
  const imgs = Array.isArray(o.imageUrls) ? (o.imageUrls as unknown[]).filter((u): u is string => typeof u === "string").map((u) => hiRes(absImg(u), "full")) : [];
  const seller = (o.sellerInformation ?? {}) as Obj;
  return {
    externalId: id.toLowerCase(),
    url: vip.startsWith("/") ? MARKTPLAATS_ORIGIN + vip : vip,
    title,
    description: str(o.description) ?? str(o.categorySpecificDescription) ?? "",
    askingCents: cents,
    location: str(loc.cityName),
    distanceKm: dist,
    category: Array.isArray(o.verticals) ? str((o.verticals as unknown[])[0]) : null,
    sellerType: seller.isVerified ? "verified" : null,
    seller: {
      id: seller.sellerId != null ? String(seller.sellerId) : null,
      name: str(seller.sellerName),
      verified: typeof seller.isVerified === "boolean" ? seller.isVerified : null,
      business: Array.isArray(o.traits) ? (o.traits as unknown[]).includes("VERIFIED_SELLER") || (o.traits as unknown[]).includes("SELLER_PROFILE_URL") : null,
      anonymous: str(seller.sellerName)?.toLowerCase() === "anoniem" || seller.sellerId === 1,
      // Alleen direct aanwezige, numerieke platformgegevens gebruiken.
      rating: typeof seller.rating === "number" && seller.rating >= 0 && seller.rating <= 5 ? seller.rating : null,
      reviewCount: typeof seller.reviewCount === "number" && seller.reviewCount >= 0 ? seller.reviewCount : null,
      accountAgeMonths: typeof seller.accountAgeMonths === "number" && seller.accountAgeMonths >= 0 ? seller.accountAgeMonths : null,
    },
    shipping,
    conditionText: attrs.condition ?? null,
    publishedAt: parseListingDate(o.date, now),
    imageUrls: mergeImages(imgs).slice(0, 12),
    attributes: structured,
  };
}

export interface SearchPage {
  ads: RawAd[];
  total: number | null;
  maxPage: number | null;
  rawCount: number;
}

export function parseSearchPage(html: string, now = new Date()): SearchPage {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new SourceError("Zoekpagina bevat geen leesbare resultaten (paginastructuur gewijzigd of botcontrole)", false);
  let data: Obj;
  try {
    data = JSON.parse(m[1]) as Obj;
  } catch {
    throw new SourceError("Zoekpagina-data kon niet worden gelezen", false);
  }
  const sr = ((data.props as Obj | undefined)?.pageProps as Obj | undefined)?.searchRequestAndResponse as Obj | undefined;
  if (!sr || !Array.isArray(sr.listings)) throw new SourceError("Onverwachte structuur van de zoekpagina (geen 'listings')", false);
  const ads: RawAd[] = [];
  for (const l of sr.listings as Obj[]) {
    const a = mapSearchListing(l, now);
    if (a) ads.push(a);
  }
  return { ads, total: typeof sr.totalResultCount === "number" ? sr.totalResultCount : null, maxPage: typeof sr.maxAllowedPageNumber === "number" ? sr.maxAllowedPageNumber : null, rawCount: (sr.listings as unknown[]).length };
}

/** Vul de (afgekapte) zoekresultaat-gegevens aan met de volledige detailpagina. */
export function mergeDetail(list: RawAd, detail: RawAd): RawAd {
  return {
    ...list,
    description: (detail.description ?? "").length > (list.description ?? "").length ? detail.description : list.description,
    // Detailpagina eerst: die heeft de volledige fotoset; zoekresultaat-foto's vullen alleen aan
    imageUrls: mergeImages(detail.imageUrls.map((u) => hiRes(u, "full")), list.imageUrls).slice(0, 20),
    detailLoaded: true,
    seller: detail.seller || list.seller ? {
      ...detail.seller,
      ...Object.fromEntries(Object.entries(list.seller ?? {}).filter(([, v]) => v != null)),
    } : undefined,
    askingCents: list.askingCents ?? detail.askingCents ?? null,
    location: list.location ?? detail.location ?? null,
  };
}

const throttle = new Throttle(3000);

/** Gedeelde paginacache: profielen met dezelfde zoekterm/categorie halen een pagina niet dubbel op. */
const pageCache = new Map<string, { at: number; status: number; text: string }>();
export function clearPageCache() {
  pageCache.clear();
}
async function cachedPage(url: string, ttlMs: number, load: () => Promise<{ status: number; text: string }>, stats?: { pages: number; cacheHits: number }) {
  const hit = ttlMs > 0 ? pageCache.get(url) : undefined;
  if (hit && Date.now() - hit.at < ttlMs) {
    if (stats) stats.cacheHits++;
    return hit;
  }
  const r = await load();
  if (stats) stats.pages++;
  const entry = { at: Date.now(), status: r.status, text: r.text };
  if (ttlMs > 0 && r.status < 400) {
    pageCache.set(url, entry);
    if (pageCache.size > 200) for (const [k, v] of pageCache) if (Date.now() - v.at > ttlMs) pageCache.delete(k);
  }
  return entry;
}

export const searchAdapter: SourceAdapter = {
  id: "marktplaats-search",
  label: "Zoeken op Marktplaats",
  origin: "SEARCH",
  minIntervalMinutes: 5,
  automatic: true,
  description:
    "Zoekt automatisch op door jou ingestelde zoektermen (en categorie) via de publieke zoekpagina's van Marktplaats en haalt alle resultaten op. Respecteert robots.txt (de verboden zoek-API wordt niet gebruikt), wacht minstens 3 seconden tussen requests en omzeilt geen blokkades.",
  async fetchProfile(ctx: FetchContext) {
    const cfg = await getConfig();
    const sc = searchConfigSchema.parse(ctx.config);
    // Ondergrens van 3 s tussen requests (alleen in tests uitgeschakeld)
    const floor = process.env.NODE_ENV === "test" ? 0 : 3;
    const gap = Math.max(cfg.limits.minSecondsBetweenRequests, floor) * 1000;
    const th = gap === 3000 ? throttle : new Throttle(gap);
    const seen = new Map<string, RawAd>();
    let pagesFetched = 0;
    // Eenheden: smalle filterpagina's (indien meegegeven) of de zoektermen
    const queryUnit = (q: string, category?: string) => ({ key: `q:${q}`, urlFor: (page: number) => buildSearchUrl(q, category, page) });
    const units: Array<{ key: string; urlFor: (page: number) => string }> = ctx.slices?.length
      ? [...ctx.slices.map((sl) => ({ key: sl.url, urlFor: (page: number) => (page > 1 ? `${sl.url}p/${page}/` : sl.url) })), ...(ctx.extraQueries ?? []).map((q) => queryUnit(q, sc.category || undefined))]
      : sc.queries.map((q) => queryUnit(q, sc.category || undefined));
    outer: for (const unit of units) {
      const info = { pages: 0, total: null as number | null, covered: 0 };
      const done = () => ctx.onUnit?.(unit.key, info);
      // Snelle modus: zoveel pagina's als nodig om álle resultaten van de (smalle) zoekopdracht te zien, tot de ingestelde bovengrens
      for (let page = 1; page <= (ctx.fast ? ctx.fast.pages : sc.maxPages); page++) {
        const url = unit.urlFor(page);
        const res = await cachedPage(url, ctx.fetchImpl ? 0 : (ctx.cacheSeconds ?? cfg.scheduler.pageCacheSeconds) * 1000, () => safeFetch(url, { allowlist: cfg.sources.urlAllowlist, respectRobots: true, fetchImpl: ctx.fetchImpl, lookup: ctx.lookup, throttle: th, maxBytes: 4_000_000 }), ctx.stats);
        pagesFetched++;
        info.pages++;
        if (res.status === 404) break;
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          throw new SourceError(`Marktplaats weigert toegang (HTTP ${res.status}). Er wordt niet geprobeerd dit te omzeilen; verlaag de frequentie of gebruik een export.`, res.status === 429);
        }
        if (res.status >= 400) throw new SourceError(`Marktplaats gaf HTTP ${res.status}`);
        const p = parseSearchPage(res.text);
        if (page === 1) info.total = p.total;
        info.covered += p.rawCount;
        if (ctx.stats) {
          if (page === 1 && p.total != null) ctx.stats.total = (ctx.stats.total ?? 0) + p.total;
          ctx.stats.covered = (ctx.stats.covered ?? 0) + p.rawCount;
        }
        for (const ad of p.ads) {
          if (ctx.prefilter && !ctx.prefilter(ad)) continue;
          if (!seen.has(ad.externalId)) seen.set(ad.externalId, ad);
          if (seen.size >= ctx.maxAds) {
            done();
            break outer;
          }
        }
        if (p.rawCount < PAGE_SIZE || (p.maxPage != null && page >= p.maxPage)) break;
      }
      done();
    }
    let ads = [...seen.values()];

    // Volledige tekst + alle foto's van de detailpagina voor advertenties waarvan we die nog niet hebben
    // (nieuw, of eerder niet aan de beurt gekomen door de limiet). Nieuwste eerst, begrensd per run.
    if (sc.fetchDetails && !ctx.deferDetails && ads.length) {
      const known = await prisma.advertisement.findMany({ where: { source: "marktplaats", externalId: { in: ads.map((a) => a.externalId) } }, select: { externalId: true, detailFetchedAt: true } });
      const done = new Set(known.filter((k) => k.detailFetchedAt).map((k) => k.externalId));
      const todo = ads.filter((a) => !done.has(a.externalId)).slice(0, cfg.limits.maxDetailsPerRun);
      for (const a of todo) {
        try {
          const d = await fetchListingUrl(a.url, { allowlist: cfg.sources.urlAllowlist, minSecondsBetween: gap / 1000, fetchImpl: ctx.fetchImpl, lookup: ctx.lookup, throttleId: "search-detail" });
          ads = ads.map((x) => (x.externalId === a.externalId ? mergeDetail(x, d) : x));
        } catch {
          /* detailpagina niet beschikbaar (verkocht/verwijderd/geweigerd): zoekresultaat-gegevens blijven gelden */
        }
      }
    }
    if (!ads.length && pagesFetched === 0) throw new SourceError("Geen zoekopdracht uitgevoerd", false);
    return ads;
  },
};
