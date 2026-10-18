/** Read-only public-source comparison/watch; never imports a URL as a detected ad.
 * npm run verify:recent -- iphone --compare --watch=120 --target=m1234567890
 * The target is only checked against real search results. No push is sent here.
 */
import { ProxyAgent } from "undici";
import { buildSearchUrl, parseSearchPage } from "../src/lib/sources/marktplaats-search";
import { publicRecentUrl, recentSince } from "../src/lib/sources/recent-search";
import { parseRobots, robotsAllows, USER_AGENT } from "../src/lib/sources/safe-fetch";

async function main() {
  const query = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "iphone";
  const option = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const watch = Number(option("watch") ?? 0);
  const minutes = Number(option("minutes") ?? 5);
  const target = option("target");
  if (!Number.isFinite(watch) || watch < 0 || watch > 300 || !Number.isInteger(minutes) || minutes < 1 || minutes > 60
    || target && !/^m\d{6,20}$/.test(target)) throw new Error("Ongeldige probe-opties");
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  const fetchText = async (url: string) => {
    const response = await fetch(url, { method: "GET", redirect: "error", cache: "no-store",
      headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000),
      ...(dispatcher ? { dispatcher } : {}) } as RequestInit);
    if (!response.ok) throw new Error(`Bron HTTP ${response.status}; geen omzeiling of automatische herhaling`);
    const body = await response.text();
    if (Buffer.byteLength(body) > 4_000_000) throw new Error("Bronresponse te groot");
    return body;
  };
  let lastRequestAt = 0;
  try {
    const rules = parseRobots(await fetchText("https://www.marktplaats.nl/robots.txt"));
    lastRequestAt = Date.now();
    const get = async (sinceMs?: number, kind = "recent") => {
      const base = buildSearchUrl(query, undefined, 1);
      const url = sinceMs === undefined ? base : publicRecentUrl(base, sinceMs, 1);
      const u = new URL(url);
      if (!robotsAllows(rules, u.pathname)) throw new Error("Route niet toegestaan volgens robots.txt");
      const wait = 5000 - (Date.now() - lastRequestAt);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      lastRequestAt = Date.now();
      const page = parseSearchPage(await fetchText(url));
      const filtered = sinceMs === undefined ? null : page.appliedSinceMs === sinceMs;
      if (filtered === false) throw new Error("Bron bevestigt het gevraagde tijdvenster niet");
      const data = { kind, checkedAt: new Date().toISOString(), windowStart: sinceMs === undefined ? null : new Date(sinceMs).toISOString(),
        filterConfirmed: filtered, total: page.total, pageResults: page.rawCount, promoted: page.promotedCount, organic: page.organicCount,
        ids: page.ads.map(a => a.externalId), targetFound: target ? page.ads.some(a => a.externalId === target) : null };
      console.log(JSON.stringify(data));
      return page;
    };
    if (process.argv.includes("--compare")) {
      await get(undefined, "broad-control");
      await get(recentSince(Date.now(), minutes), "recent-control");
      const future = await get(Math.floor((Date.now() + 300000) / 1000) * 1000, "future-negative-control");
      if (future.total !== 0 || future.rawCount !== 0) throw new Error("Toekomstcontrole is niet leeg: filtergedrag verder onderzoeken");
    }
    const started = Date.now(); const seen = new Set<string>();
    do {
      const at = Date.now(); const page = await get(recentSince(at, minutes));
      const fresh = page.ads.filter(a => !seen.has(a.externalId));
      console.log(JSON.stringify({ kind: "first-observations", secondsSinceWatchStarted: (Date.now() - started) / 1000,
        initialSample: seen.size === 0, ids: fresh.map(a => a.externalId), publicationLatencyVerified: false }));
      for (const a of page.ads) seen.add(a.externalId);
      if (Date.now() - started >= watch * 1000) break;
      await new Promise(r => setTimeout(r, 30000));
    } while (Date.now() - started < watch * 1000 + 30000);
  } finally { await dispatcher?.close(); }
}
void main().catch(e => { console.error((e as Error).message); process.exitCode = 1; });
