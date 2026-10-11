import { prisma } from "@/lib/db/client";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword } from "@/lib/security/crypto";
import { resetConfigCache } from "@/lib/settings/store";
import { resetRateLimits } from "@/lib/security/ratelimit";

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE "User","SearchProfile","Advertisement","MarketComparable","ValuationHistory","AppSettings","BackgroundJob","SourceHealth","AiUsage","AiCache","AuditLog","Purchase","CheckRun","PushSubscription" RESTART IDENTITY CASCADE`);
  resetConfigCache();
  resetRateLimits();
}

export async function makeUser(role: "ADMIN" | "USER" = "ADMIN", email = "tester@example.com") {
  const user = await prisma.user.create({ data: { email, passwordHash: hashPassword("correct-horse-battery"), role } });
  const token = await createSessionToken(user.id);
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

export function req(url: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  return new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
