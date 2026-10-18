import { getConfig } from "../settings/store";
import { generateDemoAds } from "./demo-data";
import { parseFeed } from "./feed-parser";
import { fetchListingUrl, throttleFor } from "./adapters-shared";
import { safeFetch } from "./safe-fetch";
import { searchAdapter } from "./marktplaats-search";
import { officialAdapter } from "./marktplaats-official";
import { SourceError, type FetchContext, type RawAd, type SourceAdapter } from "./types";

export { fetchListingUrl };

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

export const partnerAdapter = officialAdapter;

const ALL: SourceAdapter[] = [searchAdapter, urlAdapter, feedAdapter, demoAdapter, partnerAdapter];
export const listAdapters = () => ALL;
export const adapterForOrigin = (o: string): SourceAdapter | undefined => ALL.find((a) => a.origin === o);
