import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/security/ratelimit";

const body = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Alleen https-endpoints"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().trim().max(60).optional(),
});

export const POST = route(async (req, { user }) => {
  if (!rateLimit(`push-sub:${user.id}`, 20, 10 * 60_000).ok) throw new HttpError(429, "Te veel aanmeldingen");
  const b = await readJson(req, body);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  // endpoint is uniek: hetzelfde apparaat opnieuw aanmelden hergebruikt de rij (en wijst hem aan de huidige gebruiker toe)
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: b.endpoint },
    create: { userId: user.id, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, label: b.label ?? deviceLabel(ua), userAgent: ua },
    update: { userId: user.id, p256dh: b.keys.p256dh, auth: b.keys.auth, enabled: true, failures: 0, lastError: null, userAgent: ua },
  });
  return { id: sub.id };
});

function deviceLabel(ua: string): string {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows-pc";
  return "Apparaat";
}
