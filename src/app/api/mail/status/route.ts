import { route } from "@/lib/api";
import { getMailState } from "@/lib/mail/poll";

export const GET = route(async () => ({ state: await getMailState() }));
