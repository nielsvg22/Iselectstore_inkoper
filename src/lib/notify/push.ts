import webpush from "web-push";
import { prisma } from "../db/client";
import { decryptSecret, encryptSecret } from "../security/crypto";
import { NotifyError } from "./senders";

export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, opts: webpush.RequestOptions) => Promise<{ statusCode: number }>;

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** VAPID-sleutels: omgevingsvariabelen hebben voorrang; anders eenmalig gegenereerd en versleuteld in de database bewaard. */
export async function getVapid(): Promise<Vapid> {
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject };
  const row = await prisma.appSettings.findUnique({ where: { key: "secret:push.vapid" } });
  if (row) {
    const v = row.value as { publicKey: string; enc: string };
    return { publicKey: v.publicKey, privateKey: decryptSecret(v.enc), subject };
  }
  const keys = webpush.generateVAPIDKeys();
  const value = { publicKey: keys.publicKey, enc: encryptSecret(keys.privateKey) };
  try {
    await prisma.appSettings.create({ data: { key: "secret:push.vapid", value, secret: true } });
  } catch {
    // gelijktijdig aangemaakt door een andere proces: gebruik die sleutels
    const again = await prisma.appSettings.findUnique({ where: { key: "secret:push.vapid" } });
    if (again) {
      const v = again.value as { publicKey: string; enc: string };
      return { publicKey: v.publicKey, privateKey: decryptSecret(v.enc), subject };
    }
    throw new NotifyError("VAPID-sleutels konden niet worden opgeslagen", true);
  }
  return { ...keys, subject };
}

export async function vapidPublicKey(): Promise<string> {
  return (await getVapid()).publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Pad in het portaal dat bij klikken opent, bijv. /ads/<id> */
  url: string;
  tag: string;
  externalUrl?: string;
  isTest?: boolean;
  provisional?: boolean;
}

export interface DeviceResult {
  subscriptionId: string;
  ok: boolean;
  status?: number;
  removed?: boolean;
  error?: string;
}

const MAX_FAILURES = 8;

/** Stuurt naar alle ingeschakelde apparaten van een gebruiker; ruimt verlopen abonnementen (404/410) op. */
export async function sendPushToUser(userId: string, payload: PushPayload, send?: PushSender): Promise<DeviceResult[]> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId, enabled: true } });
  if (!subs.length) return [];
  const v = await getVapid();
  const doSend: PushSender = send ?? ((sub, body, opts) => webpush.sendNotification(sub, body, opts) as Promise<{ statusCode: number }>);
  const body = JSON.stringify(payload);
  const results: DeviceResult[] = [];
  for (const s of subs) {
    try {
      const r = await doSend({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
        vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey },
        TTL: 60 * 60 * 6,
        urgency: payload.isTest ? "normal" : "high",
        // Topic (vervangt oudere melding met dezelfde onderwerpnaam) alleen voor Apple en Mozilla; Chrome/FCM krijgt het niet mee
        topic: /fcm\.googleapis\.com|googleapis\.com|android\.googleapis/.test(s.endpoint) ? undefined : payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        timeout: 10_000,
      });
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failures: 0, lastError: null } });
      results.push({ subscriptionId: s.id, ok: true, status: r.statusCode });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const msg = ((e as Error).message ?? "onbekend").slice(0, 200);
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        results.push({ subscriptionId: s.id, ok: false, status, removed: true, error: "Abonnement verlopen en opgeruimd" });
      } else {
        const failures = s.failures + 1;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures, lastFailureAt: new Date(), lastError: msg, enabled: failures >= MAX_FAILURES ? false : undefined } });
        results.push({ subscriptionId: s.id, ok: false, status, error: msg });
      }
    }
  }
  return results;
}

/** Verwijdert abonnementen die al langer dan 60 dagen niet meer succesvol waren. */
export async function cleanupPushSubscriptions(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 86400_000);
  const r = await prisma.pushSubscription.deleteMany({ where: { OR: [{ enabled: false, lastFailureAt: { lt: cutoff } }, { lastSuccessAt: null, createdAt: { lt: cutoff }, failures: { gt: 0 } }] } });
  return r.count;
}
