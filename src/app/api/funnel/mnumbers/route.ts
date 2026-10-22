import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { registerPurchases } from "@/lib/funnel";

/** M-nummers van gekochte advertenties doorgeven (plak de berichten of nummers). */
export const POST = route(async (req, { user }) => {
  const { text } = await readJson(req, z.object({ text: z.string().min(1).max(50000) }));
  return { registered: await registerPurchases(user.id, text) };
});
