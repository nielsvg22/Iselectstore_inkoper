import { route } from "@/lib/api";
import { dealRows } from "@/lib/dashboard";

/** Realtime-feed (nieuwste deals) voor het dashboard; wordt periodiek opgehaald. */
export const GET = route(async () => ({ feed: await dealRows({ take: 6 }) }));
