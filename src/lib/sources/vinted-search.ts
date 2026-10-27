import { getConfig } from "../settings/store";
import { safeFetch } from "./safe-fetch";
import { SourceError, type FetchContext, type RawAd, type SourceAdapter } from "./types";
import { VINTED_HOSTS, catalogUrl, parseCatalogPage, parseItemPage } from "./vinted-parse";

export const VINTED_SOURCE = "vinted";
export const VINTED_ADAPTER_ID = "vinted-search";

/** Platform van een zoekprofiel: staat in de bronconfiguratie; zonder waarde is het Marktplaats (bestaande profielen blijven werken). */
export function platformOf(sourceConfig: unknown): "marktplaats" | "vinted" {
  return (sourceConfig as { platform?: string } | null)?.platform === VINTED_SOURCE ? "vinted" : "marktplaats";
}

function checkStatus(status: number) {
  if (status === 404 || status === 410) throw new SourceError("Advertentie of pagina niet meer beschikbaar (404/410)", false);
  if (status === 401 || status === 403 || status === 429)
    throw new SourceError(`Vinted weigert toegang (HTTP ${status}). Er wordt niet geprobeerd dit te omzeilen; de bron wordt gepauzeerd.`, status === 429);
  if (status >= 400) throw new SourceError(`HTTP ${status} van Vinted`);
}

export const vintedAdapter: SourceAdapter = {
  id: VINTED_ADAPTER_ID,
  label: "Vinted (openbare zoekpagina's, Nederland)",
  origin: "SEARCH",
  minIntervalMinutes: 1,
  automatic: true,
  description:
    "Leest de openbare zoekresultaten van vinted.nl (nieuwste eerst) volgens robots.txt, met eigen requestlimiet en pauze bij HTTP 403/429. Geen inlog, geen CAPTCHA-omzeiling, geen proxy's.",
  async fetchProfile(ctx: FetchContext): Promise<RawAd[]> {
    const cfg = await getConfig();
    if (!cfg.scheduler.vinted.enabled) throw new SourceError("Vinted staat uit in de instellingen", false);
    const sc = ctx.config as { queries?: string[]; priceFrom?: number | null; priceTo?: number | null };
    const queries = (sc.queries?.length ? sc.queries : [ctx.query]).filter(Boolean).slice(0, 12);
    const out: RawAd[] = [];
    const seen = new Set<string>();
    for (const q of queries) {
      for (let page = 1; page <= cfg.scheduler.vinted.pages; page++) {
        const res = await safeFetch(catalogUrl(q, { page, priceFrom: sc.priceFrom ?? null, priceTo: sc.priceTo ?? null }), {
          allowlist: VINTED_HOSTS,
          respectRobots: true,
          fetchImpl: ctx.fetchImpl,
          lookup: ctx.lookup,
          requestPriority: "discovery",
          maxBytes: 8_000_000,
        });
        checkStatus(res.status);
        const parsed = parseCatalogPage(res.text);
        if (ctx.stats) { ctx.stats.pages++; ctx.stats.total = (ctx.stats.total ?? 0) + (parsed.totalEntries ?? 0); }
        const fresh = parsed.ads.filter((a) => !seen.has(a.externalId));
        for (const a of fresh) seen.add(a.externalId);
        const kept = ctx.prefilter ? fresh.filter((a) => ctx.prefilter!(a)) : fresh;
        if (ctx.onAds && kept.length) await ctx.onAds(kept);
        out.push(...kept);
        if (ctx.stats) ctx.stats.covered = (ctx.stats.covered ?? 0) + fresh.length;
        if (out.length >= ctx.maxAds || parsed.totalPages == null || page >= parsed.totalPages) break;
      }
    }
    return out;
  },
};

/** Haalt de advertentiepagina op (omschrijving, verkoper, bescherming, verificatie). Zelfde pacing en pauze als de zoekopdracht. */
export async function fetchVintedDetail(url: string, opts: { fetchImpl?: typeof fetch; lookup?: (host: string) => Promise<string[]>; requestPriority?: "discovery" | "background" } = {}): Promise<RawAd> {
  const res = await safeFetch(url, {
    allowlist: VINTED_HOSTS,
    respectRobots: true,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
    requestPriority: opts.requestPriority ?? "background",
    maxBytes: 8_000_000,
  });
  checkStatus(res.status);
  return parseItemPage(res.text, res.url);
}
