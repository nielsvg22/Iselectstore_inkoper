import dns from "node:dns";
import { Agent } from "undici";
import { assertPublicUrl, isPrivateIp, SsrfError, type SsrfOptions } from "../security/ssrf";
import { Throttle } from "../security/ratelimit";

export const USER_AGENT = "AppleDealHunter/1.0 (persoonlijke inkoopanalyse; geen bulk-scraping)";

export interface SafeFetchOptions extends SsrfOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  respectRobots?: boolean;
  throttle?: Throttle;
}

export interface SafeResponse {
  status: number;
  url: string;
  contentType: string;
  text: string;
}

// Pint het DNS-resultaat: valideert ook op connect-tijd (tegen DNS-rebinding).
const dispatcher = new Agent({
  connect: {
    lookup: (hostname, options, cb) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err, "", 4);
        const list = Array.isArray(addrs) ? addrs : [];
        if (!list.length || list.some((a) => isPrivateIp(a.address))) return cb(new SsrfError("Privé-adres geblokkeerd"), "", 4);
        (cb as unknown as (e: null, a: unknown) => void)(null, list);
      });
    },
  },
});

const robotsCache = new Map<string, { at: number; disallow: string[] }>();

export function parseRobots(txt: string, agent = "applealhunter"): string[] {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
  const groups: Array<{ agents: string[]; disallow: string[] }> = [];
  let cur: { agents: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;
  for (const l of lines) {
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(l);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(m[2].toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (k === "disallow" && cur && m[2]) cur.disallow.push(m[2]);
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.disallow);
}

export function robotsAllows(disallow: string[], pathAndQuery: string): boolean {
  return !disallow.some((d) => {
    const pat = d.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    return new RegExp("^" + pat).test(pathAndQuery);
  });
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Antwoord te groot");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Haalt een publieke https-pagina op met SSRF-bescherming bij elke redirect,
 * groottelimiet, timeout en optioneel robots.txt-controle. Omzeilt geen blokkades:
 * bij 401/403/429/CAPTCHA wordt gewoon een fout teruggegeven.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const doFetch = opts.fetchImpl ?? ((u: string, init?: RequestInit) => fetch(u, { ...init, dispatcher } as RequestInit));
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = await assertPublicUrl(current, opts);
    if (opts.respectRobots) {
      const hit = robotsCache.get(u.host);
      let disallow: string[];
      if (hit && Date.now() - hit.at < 3_600_000) disallow = hit.disallow;
      else {
        try {
          const r = await doFetch(`${u.origin}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) });
          disallow = r.ok ? parseRobots(await r.text()) : [];
        } catch {
          disallow = [];
        }
        robotsCache.set(u.host, { at: Date.now(), disallow });
      }
      if (!robotsAllows(disallow, u.pathname + u.search)) throw new SsrfError("Het ophalen van deze URL is niet toegestaan volgens robots.txt van de bron");
    }
    if (opts.throttle) await opts.throttle.wait();
    const res = await doFetch(u.toString(), {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.5", "accept-language": "nl-NL,nl;q=0.9", ...(opts.headers ?? {}) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect zonder locatie");
      current = new URL(loc, u).toString();
      continue;
    }
    const text = await readLimited(res, opts.maxBytes ?? 2_500_000);
    return { status: res.status, url: u.toString(), contentType: res.headers.get("content-type") ?? "", text };
  }
  throw new Error("Te veel redirects");
}
