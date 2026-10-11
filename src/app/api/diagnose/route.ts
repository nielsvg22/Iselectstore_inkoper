import { route } from "@/lib/api";
import { diagnose } from "@/lib/diagnose";

export const GET = route(async (_req, { user }) => ({ checks: await diagnose(user.id) }));
