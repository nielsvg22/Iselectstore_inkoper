import { route } from "@/lib/api";
import { recentAutoMessages } from "@/lib/rules/automsg";

export const GET = route(async () => ({ messages: await recentAutoMessages(100) }), { admin: true });
