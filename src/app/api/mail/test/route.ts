import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { testMailbox } from "@/lib/mail/poll";
import { rateLimit } from "@/lib/security/ratelimit";

export const POST = route(
  async (_req, { user }) => {
    if (!rateLimit(`mail-test:${user.id}`, 10, 10 * 60_000).ok) throw new HttpError(429, "Te veel tests");
    try {
      return await testMailbox();
    } catch (e) {
      // geen wachtwoorden of serverdetails lekken: alleen een nette melding
      throw new HttpError(400, `Verbinding mislukt: ${(e as Error).message.replace(/password|pass=\S+/gi, "***").slice(0, 200)}`);
    }
  },
  { admin: true },
);
