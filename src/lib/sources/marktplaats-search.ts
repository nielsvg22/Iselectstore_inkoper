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
    askingCents: list.askingCents ?? detail.askingCents ?? null,
    location: list.location ?? detail.location ?? null,
  };
}

const throttle = new Throttle(3000);

export const searchAdapter: SourceAdapter = {
  id: "marktplaats-search",
  label: "Zoeken op Marktplaats",
  origin: "SEARCH",
  minIntervalMinutes: 30,
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
    outer: for (const q of sc.queries) {
      for (let page = 1; page <= sc.maxPages; page++) {
        const url = buildSearchUrl(q, sc.category || undefined, page);
        const res = await safeFetch(url, { allowlist: cfg.sources.urlAllowlist, respectRobots: true, fetchImpl: ctx.fetchImpl, lookup: ctx.lookup, throttle: th, maxBytes: 4_000_000 });
        pagesFetched++;
        if (res.status === 404) break;
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          throw new SourceError(`Marktplaats weigert toegang (HTTP ${res.status}). Er wordt niet geprobeerd dit te omzeilen; verlaag de frequentie of gebruik een export.`, res.status === 429);
        }
        if (res.status >= 400) throw new SourceError(`Marktplaats gaf HTTP ${res.status}`);
        const p = parseSearchPage(res.text);
        for (const ad of p.ads) {
          if (ctx.prefilter && !ctx.prefilter(ad)) continue;
          if (!seen.has(ad.externalId)) seen.set(ad.externalId, ad);
          if (seen.size >= ctx.maxAds) break outer;
        }
        if (p.rawCount < PAGE_SIZE || (p.maxPage != null && page >= p.maxPage)) break;
      }
    }
    let ads = [...seen.values()];

    // Volledige tekst + alle foto's van de detailpagina voor advertenties waarvan we die nog niet hebben
    // (nieuw, of eerder niet aan de beurt gekomen door de limiet). Nieuwste eerst, begrensd per run.
    if (sc.fetchDetails && ads.length) {
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
