import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { appSecret, isProd } from "./env";
import { prisma } from "./db/client";
import { rateLimit } from "./security/ratelimit";

export const SESSION_COOKIE = "adh_session";
const SESSION_DAYS = 7;
const secretKey = () => new TextEncoder().encode(appSecret());

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: isProd() && process.env.INSECURE_COOKIES !== "1", path: "/", maxAge: SESSION_DAYS * 86400 };
}

export async function getUserFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  const id = await verifySessionToken(token);
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true } });
  return u;
}

/** Server components / pages. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getUserFromToken(store.get(SESSION_COOKIE)?.value);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // niet-browser clients (curl, tests) sturen geen Origin; cookies vereisen sowieso sessie
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Server-side autorisatie voor API-routes. Gooit HttpError(401/403). */
export async function requireUser(req: Request, opts: { admin?: boolean } = {}): Promise<SessionUser> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookieHeader);
  const user = await getUserFromToken(m ? decodeURIComponent(m[1]) : null);
  if (!user) throw new HttpError(401, "Niet ingelogd");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) throw new HttpError(403, "Ongeldige oorsprong van het verzoek");
  if (opts.admin && user.role !== "ADMIN") throw new HttpError(403, "Onvoldoende rechten");
  const rl = rateLimit(`api:${user.id}`, 600, 60_000);
  if (!rl.ok) throw new HttpError(429, "Te veel verzoeken");
  return user;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
