import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateIp, SsrfError } from "@/lib/security/ssrf";
import { decryptSecret, encryptSecret, hashPassword, redact, verifyPassword } from "@/lib/security/crypto";
import { rateLimit, resetRateLimits } from "@/lib/security/ratelimit";
import { parseRobots, robotsAllows, safeFetch } from "@/lib/sources/safe-fetch";

const pub = async () => ["93.184.216.34"];

describe("SSRF-bescherming", () => {
  it.each(["http://www.marktplaats.nl/x", "ftp://marktplaats.nl", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://user:pw@marktplaats.nl/x", "https://marktplaats.nl:8443/x", "https://foo.internal/x", "javascript:alert(1)", "niet-een-url"])("weigert %s", async (u) => {
    await expect(assertPublicUrl(u, { lookup: pub })).rejects.toBeInstanceOf(SsrfError);
  });
  it("weigert hosts die naar een privé-IP wijzen (DNS-rebinding)", async () => {
    await expect(assertPublicUrl("https://evil.example.com/x", { lookup: async () => ["192.168.1.10"] })).rejects.toThrow(/privé/);
    await expect(assertPublicUrl("https://evil.example.com/x", { lookup: async () => ["93.184.216.34", "127.0.0.1"] })).rejects.toThrow();
  });
  it("past de allowlist toe (incl. subdomeinen, niet gelijkende domeinen)", async () => {
    const o = { allowlist: ["marktplaats.nl"], lookup: pub };
    await expect(assertPublicUrl("https://www.marktplaats.nl/v/a", o)).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("https://marktplaats.nl/v/a", o)).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("https://evilmarktplaats.nl/v/a", o)).rejects.toThrow(/lijst/);
    await expect(assertPublicUrl("https://marktplaats.nl.evil.com/v/a", o)).rejects.toThrow(/lijst/);
  });
  it("classificeert privé-adressen", () => {
    for (const ip of ["10.1.1.1", "172.16.0.1", "172.31.255.1", "192.168.0.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("controleert elke redirect-hop opnieuw", async () => {
    const f = (async (u: string) => (u.includes("start") ? new Response(null, { status: 302, headers: { location: "https://10.0.0.1/admin" } }) : new Response("ok"))) as unknown as typeof fetch;
    await expect(safeFetch("https://www.marktplaats.nl/start", { fetchImpl: f, lookup: pub })).rejects.toBeInstanceOf(SsrfError);
  });
  it("respecteert robots.txt", async () => {
    const f = (async (u: string) => (u.endsWith("robots.txt") ? new Response("User-agent: *\nDisallow: /private") : new Response("ok"))) as unknown as typeof fetch;
    await expect(safeFetch("https://shop.example.org/private/x", { fetchImpl: f, lookup: pub, respectRobots: true })).rejects.toThrow(/robots/);
    await expect(safeFetch("https://shop.example.org/public/x", { fetchImpl: f, lookup: pub, respectRobots: true })).resolves.toMatchObject({ status: 200, text: "ok" });
  });
  it("begrenst antwoordgrootte", async () => {
    const f = (async () => new Response("x".repeat(5000))) as unknown as typeof fetch;
    await expect(safeFetch("https://shop.example.org/", { fetchImpl: f, lookup: pub, maxBytes: 1000 })).rejects.toThrow(/groot/);
  });
  it("robots-parser", () => {
    const d = parseRobots("User-agent: *\nDisallow: /a\nDisallow: /b/*.json$\n\nUser-agent: googlebot\nDisallow: /");
    expect(robotsAllows(d, "/a/x")).toBe(false);
    expect(robotsAllows(d, "/c")).toBe(true);
    expect(robotsAllows(d, "/b/data.json")).toBe(false);
  });
});

describe("crypto, wachtwoorden, limieten", () => {
  it("versleutelt en ontsleutelt geheimen; manipulatie wordt gedetecteerd", () => {
    const enc = encryptSecret("12345:SECRET-token-value");
    expect(enc).not.toContain("SECRET");
    expect(decryptSecret(enc)).toBe("12345:SECRET-token-value");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
  it("wachtwoord-hash is gezouten en verifieerbaar", () => {
    const h1 = hashPassword("geheim-wachtwoord");
    const h2 = hashPassword("geheim-wachtwoord");
    expect(h1).not.toBe(h2);
    expect(verifyPassword("geheim-wachtwoord", h1)).toBe(true);
    expect(verifyPassword("verkeerd", h1)).toBe(false);
    expect(verifyPassword("x", "kapot")).toBe(false);
  });
  it("maskeert geheimen in logs", () => {
    expect(redact("fout bij https://api.telegram.org/bot123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ12/sendMessage")).not.toContain("ABCDEFGHIJ");
    expect(redact("key sk-abcdefghijklmnop1234567890")).not.toContain("1234567890");
    expect(redact("https://discord.com/api/webhooks/123/abcDEF_ghi")).not.toContain("abcDEF");
  });
  it("rate limiter blokkeert na de limiet en herstelt na het venster", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 1000 + i).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, 1500).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, 2500).ok).toBe(true);
  });
});
