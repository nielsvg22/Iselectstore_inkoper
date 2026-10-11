import { route } from "@/lib/api";
import { vapidPublicKey } from "@/lib/notify/push";

/** Alleen de publieke VAPID-sleutel; de private sleutel verlaat de server nooit. */
export const GET = route(async () => ({ publicKey: await vapidPublicKey() }));
