import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/ratelimit";

const schema = z.object({ email: z.string().email().max(200), name: z.string().max(100).optional(), password: z.string().min(10, "Minimaal 10 tekens").max(200) });

/** Eerste gebruiker aanmaken; werkt alleen zolang er nog geen gebruikers zijn. */
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`setup:${clientIp(req)}`, 5, 10 * 60_000);
    if (!rl.ok) return json({ error: "Te veel pogingen" }, 429);
    const body = await readJson(req, schema);
    const user = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) return null;
      return tx.user.create({ data: { email: body.email.toLowerCase(), name: body.name ?? null, passwordHash: hashPassword(body.password), role: "ADMIN" } });
    });
    if (!user) return json({ error: "Er bestaat al een account. Log in." }, 403);
    await prisma.auditLog.create({ data: { userId: user.id, action: "setup.admin_created" } });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
