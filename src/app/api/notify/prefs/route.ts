import { readJson, route } from "@/lib/api";
import { getPrefs, notifyPrefsSchema, setPrefs } from "@/lib/notify/prefs";

export const GET = route(async (_req, { user }) => ({ prefs: await getPrefs(user.id) }));
export const PUT = route(async (req, { user }) => ({ prefs: await setPrefs(user.id, await readJson(req, notifyPrefsSchema)) }));
