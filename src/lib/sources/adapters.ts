import { Throttle } from "../security/ratelimit";
import { getConfig } from "../settings/store";
import { generateDemoAds } from "./demo-data";
import { parseFeed } from "./feed-parser";
import { ParseError, parseListingHtml } from "./listing-parser";
import { safeFetch } from "./safe-fetch";
import { SourceError, type FetchContext, type RawAd, type SourceAdapter } from "./types";

const throttles = new Map<string, Throttle>();
function throttleFor(id: string, secs: number) {
  let t = throttles.get(id);
  if (!t) {
    t = new Throttle(secs * 1000);
    throttles.set(id, t);
  }
  return t;
}

export async function fetchListingUrl(url: string, opts: { allowlist: string[]; minSecondsBetween: number; respectRobots?: boolean; fetchImpl?: typeof fetch; throttleId?: string }): Promise<RawAd> {
  const res = await safeFetch(url, {
    allowlist: opts.allowlist,
    respectRobots: opts.respectRobots ?? true,
    fetchImpl: opts.fetchImpl,
    throttle: throttleFor(opts.throttleId ?? "url", opts.minSecondsBetween),
  });
  if (res.status === 404 || res.status === 410) throw new SourceError("Advertentie niet meer beschikbaar (404/410)", false);
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new SourceError(`De bron weigert toegang (HTTP ${res.status}). Er wordt niet geprobeerd dit te omzeilen; gebruik een toegestane export of API.`, res.status === 429);
  }
  if (res.status >= 400) throw new SourceError(`HTTP ${res.status} van de bron`);
  if (/captcha|robot check|bevestig dat je geen robot/i.test(res.text.slice(0, 20000)) && !/application\/ld\+json|__NEXT_DATA__/.test(res.text)) {
    throw new SourceError("De bron toont een CAPTCHA/botcontrole. Dit wordt niet omzeild.", false);
  }
  try {
    const ad = parseListingHtml(res.text, res.url);
    return ad;
  } catch (e) {
    if (e instanceof ParseError) throw new SourceError(`Pagina kon niet worden uitgelezen: ${e.message}`, false);
    throw e;
  }
}

export const urlAdapter: SourceAdapter = {
  id: "manual-url",
  label: "URL-import (individuele advertenties)",
  origin: "MANUAL_URL",
  minIntervalMinutes: 30,
  automatic: true,
  description: "Leest door u opgegeven advertentie-URL's uit en controleert ze periodiek opnieuw op prijswijzigingen. Respecteert robots.txt, rate limits en omzeilt geen toegangsbeperkingen.",
  async fetchProfile(ctx: FetchContext) {
    const cfg = await getConfig();
    const urls = ((ctx.config.urls as string[] | undefined) ?? []).slice(0, ctx.maxAds);
    const out: RawAd[] = [];
    const errors: string[] = [];
    for (const url of urls) {
      try {
        out.push(await fetchListingUrl(url, { allowlist: cfg.sources.urlAllowlist, minSecondsBetween: cfg.limits.minSecondsBetweenRequests }));
      } catch (e) {
        errors.push(`${url}: ${(e as Error).message}`);
      }
    }
    if (!out.length && errors.length) throw new SourceError(errors.join(" | ").slice(0, 400));
    return out;
  },
};

export const feedAdapter: SourceAdapter = {
  id: "feed",
  label: "Feed (JSON/CSV-URL)",
  origin: "FEED",
  minIntervalMinutes: 15,
  automatic: true,
  description: "Haalt een door u geautoriseerde JSON- of CSV-feed op (bijv. export van een partner of eigen verzamelaar) en verwerkt nieuwe/gewijzigde advertenties.",
  async fetchProfile(ctx: FetchContext) {
    const url = String(ctx.config.feedUrl ?? "");
    if (!url) throw new SourceError("Geen feed-URL ingesteld voor dit zoekprofiel", false);
    const cfg = await getConfig();
    const feedHosts = (ctx.config.allowedHosts as string[] | undefined)?.filter(Boolean);
    const res = await safeFetch(url, {
      allowlist: feedHosts?.length ? feedHosts : undefined,
      throttle: throttleFor("feed", cfg.limits.minSecondsBetweenRequests),
      maxBytes: 8_000_000,
    });
    if (res.status >= 400) throw new SourceError(`Feed gaf HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const { ads } = parseFeed(res.text, ctx.maxAds);
    return ads;
  },
};

export const demoAdapter: SourceAdapter = {
  id: "demo",
  label: "Demonstratiedata",
  origin: "DEMO",
  minIntervalMinutes: 5,
  automatic: false,
  description: "Duidelijk gemarkeerde voorbeeldadvertenties om de applicatie te verkennen. Geen echte advertenties.",
  async fetchProfile(ctx: FetchContext) {
    return generateDemoAds(Number(ctx.config.count ?? 36), Number(ctx.config.seed ?? 7)).slice(0, ctx.maxAds);
  },
};

export const partnerAdapter: SourceAdapter = {
  id: "partner-api",
  label: "Officiële partner-API (niet geconfigureerd)",
  origin: "PARTNER_API",
  minIntervalMinutes: 15,
  automatic: true,
  description: "Plaatshouder voor een officiële Marktplaats-partnerintegratie. Er is geen publiek gedocumenteerde zoek-API gevonden; zodra u toegang en documentatie van Marktplaats krijgt kan hier een adapter worden aangesloten.",
  async fetchProfile() {
    throw new SourceError("Geen officiële Marktplaats-API-toegang geconfigureerd. Zie docs/DATABRONNEN.md.", false);
  },
};

const ALL: SourceAdapter[] = [urlAdapter, feedAdapter, demoAdapter, partnerAdapter];
export const listAdapters = () => ALL;
export const adapterForOrigin = (o: string): SourceAdapter | undefined => ALL.find((a) => a.origin === o);
