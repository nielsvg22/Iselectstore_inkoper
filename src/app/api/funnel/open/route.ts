import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { markOpened } from "@/lib/funnel";

export const POST = route(async (req, { user }) => ({ updated: await markOpened(user.id, (await readJson(req, z.object({ adId: z.string().min(1).max(40) }))).adId) }));
