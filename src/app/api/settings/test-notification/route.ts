import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { sendTestNotification } from "@/lib/notify/dispatch";

export const POST = route(
  async (req) => {
    const { channel } = await readJson(req, z.object({ channel: z.enum(["TELEGRAM", "DISCORD"]) }));
    await sendTestNotification(channel);
    return { ok: true };
  },
  { admin: true },
);
