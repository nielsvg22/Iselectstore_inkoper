import { errorResponse, json } from "@/lib/api";
import { getUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runTick } from "@/lib/jobs/tick";
import { safeEqual } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (secret && secret.length >= 16 && bearer && safeEqual(bearer, secret)) return true;
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "");
  const user = await getUserFromToken(m ? decodeURIComponent(m[1]) : null);
  return !!user;
}

async function handle(req: Request) {
  try {
    if (!(await authorized(req))) return json({ error: "Niet geautoriseerd" }, 401);
    if (!rateLimit("tick", 30, 60_000).ok) return json({ error: "Te veel aanroepen" }, 429);
    return json({ ok: true, ...(await runTick()) });
  } catch (e) {
    return errorResponse(e);
  }
}
// Vercel Cron gebruikt GET; externe schedulers kunnen POST gebruiken.
export const GET = handle;
export const POST = handle;
