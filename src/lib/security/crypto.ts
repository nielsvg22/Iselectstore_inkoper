import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { appSecret } from "../env";

const key = () => createHash("sha256").update("adh-settings:" + appSecret()).digest();

/** AES-256-GCM; formaat v1:iv:tag:data (base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Ongeldig versleuteld formaat");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Maskeer secrets in logregels / foutmeldingen. */
export function redact(text: string): string {
  return text
    .replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, "bot<redacted>")
    .replace(/(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, "$1…")
    .replace(/(api[_-]?key["'=:\s]+)[A-Za-z0-9_-]{8,}/gi, "$1<redacted>")
    .replace(/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g, "discord.com/api/webhooks/<redacted>");
}
