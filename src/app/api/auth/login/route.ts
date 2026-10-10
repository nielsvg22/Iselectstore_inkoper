import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/security/crypto";
import { peekRateLimit, recordHit } from "@/lib/security/ratelimit";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    // Alleen mislukte pogingen tellen mee: geslaagde logins verbruiken het budget niet
    const key = `login:${clientIp(req)}`;
    const rl = peekRateLimit(key, 10, 10 * 60_000);
    if (!rl.ok) return json({ error: `Te veel inlogpogingen. Probeer het over ${rl.retryAfterSec} seconden opnieuw.` }, 429);
    const { email, password } = await readJson(req, schema);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Vergelijk altijd een hash om timing-verschillen te beperken
    const ok = user ? verifyPassword(password, user.passwordHash) : (verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "=="), false);
    if (!user || !ok) {
      recordHit(key);
      await prisma.auditLog.create({ data: { action: "login.failed", meta: { email: email.toLowerCase().slice(0, 3) + "***" } } });
      return json({ error: "Onjuiste inloggegevens" }, 401);
    }
    await prisma.auditLog.create({ data: { userId: user.id, action: "login.success" } });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
