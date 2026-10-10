import { Throttle } from "../security/ratelimit";
import { ParseError, parseListingHtml } from "./listing-parser";
import { safeFetch } from "./safe-fetch";
import { SourceError, type RawAd } from "./types";

const throttles = new Map<string, Throttle>();
export function throttleFor(id: string, secs: number) {
  let t = throttles.get(id);
  if (!t) {
    t = new Throttle(secs * 1000);
    throttles.set(id, t);
  }
  return t;
}

export async function fetchListingUrl(url: string, opts: { allowlist: string[]; minSecondsBetween: number; respectRobots?: boolean; fetchImpl?: typeof fetch; lookup?: (host: string) => Promise<string[]>; throttleId?: string }): Promise<RawAd> {
  const res = await safeFetch(url, {
    allowlist: opts.allowlist,
    respectRobots: opts.respectRobots ?? true,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
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
    return { ...ad, detailLoaded: true };
  } catch (e) {
    if (e instanceof ParseError) throw new SourceError(`Pagina kon niet worden uitgelezen: ${e.message}`, false);
    throw e;
  }
}

