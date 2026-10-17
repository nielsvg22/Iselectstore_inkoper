import { errorResponse, json } from "@/lib/api";
import { getJobStatus } from "@/lib/jobs/status";
import { safeEqual } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/ratelimit";

export const dynamic = "force-dynamic";

/** Alleen de scheduler/operator met CRON_SECRET; wijzigt niets en verstuurt geen push. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!secret || secret.length < 16 || !bearer || !safeEqual(secret, bearer))
    return json({ error: "Niet geautoriseerd" }, 401);
  const params = new URL(req.url).searchParams;
  const id = params.get("externalId");
  if (id !== null && !/^m\d{6,20}$/.test(id)) return json({ error: "Ongeldig advertentienummer" }, 400);
  if (!rateLimit("jobs-status", 30, 60_000).ok) return json({ error: "Te veel aanroepen" }, 429);
  try {
    const response = json(await getJobStatus(id ?? undefined));
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (e) { return errorResponse(e); }
}
