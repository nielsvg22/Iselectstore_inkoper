/** Read-only capability probe. Never prints credentials, identities, ads or provider bodies.
 * GG key: GOEDGEPLAATST_API_KEY_FILE=/private/key npm run verify:official -- goedgeplaatst
 * MP OAuth: MARKTPLAATS_TOKEN_FILE=/private/token npm run verify:official -- marktplaats
 * These are separate issuers. A GG key is never sent to Marktplaats.
 */
import { readFileSync } from "node:fs";
import { ProxyAgent } from "undici";

async function main() {
  // Honour the execution environment's proxy, never tunnel directly around it.
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  const request = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { method: "GET", headers, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(20000), ...(dispatcher ? { dispatcher } : {}) } as RequestInit);
    const body: unknown = await res.json().catch(() => null);
    return { status: res.status, body: body as { result?: boolean; totalItems?: number; data?: Array<{ userId?: number }> } | null };
  };
  const readKey = (env: string) => {
    const file = process.env[env]; if (!file) throw new Error(`Configureer ${env} als pad naar een privébestand`);
    const value = readFileSync(file, "utf8").trim(); if (!value) throw new Error("Leeg credentialbestand"); return value;
  };
  try {
    const mode = process.argv[2];
    if (mode === "goedgeplaatst") {
      const key = readKey("GOEDGEPLAATST_API_KEY_FILE");
      const headers = { Authentication: key, Accept: "application/json" };
      const base = "https://api.goedgeplaatst.nl/rest/v1";
      const users = await request(`${base}/users/?useCache=0&page=1&itemsPerPage=1`, headers);
      console.log(JSON.stringify({ endpoint: "GET /users/ (own client)", status: users.status, result: users.body?.result ?? null }));
      const id = users.body?.data?.[0]?.userId;
      if (users.status !== 200 || !Number.isSafeInteger(id)) return;
      // Stay within the documented 3/sec limit; no repeated requests after denial.
      await new Promise(r => setTimeout(r, 500));
      const ads = await request(`${base}/ads/?userId=${id}&useCache=0&page=1&itemsPerPage=1&simple=1`, headers);
      console.log(JSON.stringify({ endpoint: "GET /ads/ (own user)", status: ads.status, result: ads.body?.result ?? null, totalItems: ads.body?.totalItems ?? null }));
      await new Promise(r => setTimeout(r, 500));
      const auth = await request(`${base}/oauth/${id}/marktplaats/?useCache=0`, headers);
      console.log(JSON.stringify({ endpoint: "GET /oauth/{own-user}/marktplaats/", status: auth.status, result: auth.body?.result ?? null,
        oauthAvailable: auth.status === 200 && auth.body?.result === true, thirdPartySearchVerified: false }));
      // Any returned OAuth tokens are deliberately discarded. Never refresh or revoke shared tokens.
    } else if (mode === "marktplaats" || mode === "marktplaats-anonymous") {
      const token = mode === "marktplaats" ? readKey("MARKTPLAATS_TOKEN_FILE") : null;
      const r = await request("https://api.marktplaats.nl/v2/search?query=iphone&offset=0&limit=1", {
        Accept: "application/hal+json, application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
      });
      console.log(JSON.stringify({ endpoint: "GET /v2/search", authenticated: Boolean(token), status: r.status,
        accessVerified: r.status === 200, searchOrderByPublicationVerified: false, externalReviewsAccessVerified: false }));
    } else throw new Error("Gebruik: npm run verify:official -- goedgeplaatst | marktplaats | marktplaats-anonymous");
  } finally { await dispatcher?.close(); }
}
void main().catch(() => { console.error("Probe mislukt; credentialbestanden, netwerk of modus controleren. Geen providerbody gelogd."); process.exitCode = 1; });
