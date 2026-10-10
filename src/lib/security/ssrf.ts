import dns from "node:dns/promises";
import net from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
    if (l.startsWith("fc") || l.startsWith("fd")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

export type Lookup = (host: string) => Promise<string[]>;
const defaultLookup: Lookup = async (host) => (await dns.lookup(host, { all: true })).map((r) => r.address);

export function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((a) => {
    const d = a.toLowerCase().replace(/^\*\./, "");
    return h === d || h.endsWith("." + d);
  });
}

export interface SsrfOptions {
  allowlist?: string[]; // indien gezet: alleen deze (sub)domeinen
  lookup?: Lookup;
}

/** Valideert een URL voor uitgaande requests (SSRF-bescherming). Geeft de geparseerde URL terug. */
export async function assertPublicUrl(input: string, opts: SsrfOptions = {}): Promise<URL> {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new SsrfError("Ongeldige URL");
  }
  if (u.protocol !== "https:") throw new SsrfError("Alleen https-URL's zijn toegestaan");
  if (u.username || u.password) throw new SsrfError("URL's met inloggegevens zijn niet toegestaan");
  if (u.port && u.port !== "443") throw new SsrfError("Alleen standaardpoort 443 is toegestaan");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new SsrfError("Host niet toegestaan");
  }
  if (opts.allowlist && opts.allowlist.length && !hostMatchesAllowlist(host, opts.allowlist)) {
    throw new SsrfError(`Host ${host} staat niet op de lijst met toegestane databronnen`);
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new SsrfError("Privé-/interne IP-adressen zijn niet toegestaan");
    return u;
  }
  const addrs = await (opts.lookup ?? defaultLookup)(host);
  if (!addrs.length) throw new SsrfError("Host kon niet worden opgelost");
  if (addrs.some(isPrivateIp)) throw new SsrfError("Host verwijst naar een privé-/intern adres");
  return u;
}
