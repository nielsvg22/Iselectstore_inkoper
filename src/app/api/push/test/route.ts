import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { sendTestPush } from "@/lib/notify/dispatch";
import { rateLimit } from "@/lib/security/ratelimit";

export const POST = route(async (_req, { user }) => {
  if (!rateLimit(`push-test:${user.id}`, 10, 10 * 60_000).ok) throw new HttpError(429, "Te veel testmeldingen");
  return await sendTestPush(user.id);
});
