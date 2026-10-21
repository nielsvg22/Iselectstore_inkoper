import { prisma } from "../db/client";
import { PermanentJobError } from "../jobs/queue";
import { getConfig, getSecret } from "../settings/store";
import { inCityScope } from "../radar/locality";
import type { DealBandKey, RiskLevelKey } from "../types";
import {
  buildDealMessage,
  buildPushPayload,
  type DealMessageInput,
} from "./message";
import { sendPushToUser, type PushSender } from "./push";
import { NotifyError, sendDiscord, sendTelegram } from "./senders";

type FetchLike = typeof fetch;

function provisionalInfo(
  detailMissing: boolean,
  detailFailed: boolean,
  uncertain: boolean,
  needsReview: boolean,
): { definitive: boolean; provisionalReasons: string[] } {
  const reasons: string[] = [];
  if (detailMissing && detailFailed)
    reasons.push("volledige advertentie niet opgehaald");
  else if (detailMissing)
    reasons.push("volledige advertentie nog niet beoordeeld");
  if (uncertain) reasons.push("marktwaarde onzeker");
  if (needsReview)
    reasons.push("handmatige controle nodig (risico/iCloud/prijs)");
  return { definitive: reasons.length === 0, provisionalReasons: reasons };
}

export async function dealMessageForAd(
  adId: string,
): Promise<DealMessageInput | null> {
  const ad = await prisma.advertisement.findUnique({
    where: { id: adId },
    include: {
      product: { include: { specs: true } },
      analyses: { where: { isCurrent: true }, take: 1 },
      risk: true,
    },
  });
  const raw = (ad?.rawPayload ?? {}) as { detailFailed?: boolean };
  const a = ad?.analyses[0];
  if (!ad || !a) return null;
  const spec = (k: string) => ad.product?.specs.find((s) => s.key === k);
  const storage = spec("storageGb");
  const battery = spec("batteryHealth");
  const act = spec("activationLock");
  return {
    title: ad.title,
    modelLabel: ad.product?.modelLabel ?? ad.title,
    storageGb: storage ? Number(storage.value) : null,
    askingCents: ad.askingPriceCents,
    expectedCents: a.expectedCents,
    netProfitCents: a.netProfitCents,
    maxBidCents: a.maxBidCents,
    roiPct: a.roiPct,
    score: a.score,
    band: a.band as DealBandKey,
    batteryHealth: battery ? Number(battery.value) : null,
    batterySource:
      battery?.source === "CONFIRMED" ? "(bevestigd)" : "volgens verkoper",
    distanceKm: ad.distanceKm,
    location: ad.location,
    riskLevel: (ad.risk?.level ?? "LOW") as RiskLevelKey,
    activationLock:
      act && (act.value === "clear" || act.value === "locked")
        ? (act.value as "clear" | "locked")
        : null,
    uncertain: a.uncertain,
    adId: ad.id,
    ...provisionalInfo(
      ["SEARCH", "PARTNER_API"].includes(ad.origin) && !ad.detailFetchedAt,
      Boolean(raw.detailFailed),
      a.uncertain,
      ad.needsManualReview,
    ),
    url: ad.isDemo ? "https://demo.invalid (voorbeelddata)" : ad.url,
  };
}

export async function deliverNotification(
  notificationId: string,
  fetchImpl?: FetchLike,
  opts: { push?: PushSender } = {},
): Promise<void> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!n) throw new PermanentJobError("Melding bestaat niet");
  if (n.status === "SENT" || n.status === "SKIPPED") return;
  const cfg = await getConfig(true);
  if (cfg.radar.cityOnly) {
    const ad = await prisma.advertisement.findUnique({ where: { id: n.adId }, select: { location: true } });
    if (!ad || !inCityScope(ad.location, cfg.radar.cityOnly)) {
      await prisma.notification.update({ where: { id: n.id }, data: {
        status: "SKIPPED", error: `Teststand: uitsluitend plaats ${cfg.radar.cityOnly}`,
      } });
      return;
    }
  }
  const risk = await prisma.riskAssessment.findUnique({
    where: { adId: n.adId },
    select: { blocked: true },
  });
  if (risk?.blocked) {
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: "SKIPPED", error: "Advertentie inmiddels uitgesloten" },
    });
    return;
  }
  const msg = await dealMessageForAd(n.adId);
  if (!msg) {
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: "SKIPPED", error: "Geen analyse beschikbaar" },
    });
    return;
  }
  const { html, text } = buildDealMessage(msg);
  await prisma.notification.update({
    where: { id: n.id },
    data: { attempts: { increment: 1 } },
  });
  try {
    if (n.channel === "WEBPUSH") {
      if (!n.userId)
        throw new NotifyError("Pushmelding zonder gebruiker", false);
      const results = await sendPushToUser(
        n.userId,
        buildPushPayload(msg, `/ads/${n.adId}`),
        opts.push,
      );
      if (!results.length) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: "SKIPPED", error: "Geen actief pushapparaat" },
        });
        return;
      }
      if (!results.some((r) => r.ok)) {
        const retryable = results.some(
          (r) =>
            !r.removed &&
            (r.status == null || r.status >= 500 || r.status === 429),
        );
        throw new NotifyError(
          `Push mislukt: ${results.map((r) => r.error ?? r.status).join("; ")}`.slice(
            0,
            280,
          ),
          retryable,
        );
      }
    } else if (n.channel === "TELEGRAM") {
      const [token, cfg] = await Promise.all([
        getSecret("telegram.botToken"),
        getConfig(),
      ]);
      if (!token || !cfg.telegram.chatId)
        throw new NotifyError(
          "Telegram is niet geconfigureerd (bot-token en chat-ID)",
          false,
        );
      await sendTelegram({
        token,
        chatId: cfg.telegram.chatId,
        html,
        url: msg.url,
        fetchImpl,
      });
    } else if (n.channel === "DISCORD") {
      const hook = await getSecret("discord.webhookUrl");
      if (!hook)
        throw new NotifyError("Discord webhook niet geconfigureerd", false);
      await sendDiscord({ webhookUrl: hook, text, fetchImpl });
    } else {
      throw new NotifyError(
        `Kanaal ${n.channel} wordt (nog) niet ondersteund`,
        false,
      );
    }
    await prisma.notification.update({
      where: { id: n.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        error: null,
        payload: {
          score: msg.score,
          band: msg.band,
          definitive: msg.definitive ?? true,
        },
      },
    });
  } catch (e) {
    const retryable = e instanceof NotifyError ? e.retryable : true;
    await prisma.notification.update({
      where: { id: n.id },
      data: {
        status: retryable ? "PENDING" : "FAILED",
        error: (e as Error).message.slice(0, 300),
      },
    });
    if (!retryable) throw new PermanentJobError((e as Error).message);
    throw e;
  }
}

export async function sendTestNotification(
  channel: "TELEGRAM" | "DISCORD",
  fetchImpl?: FetchLike,
): Promise<void> {
  const msg: DealMessageInput = {
    title: "Testmelding",
    modelLabel: "iPhone 15 Pro",
    storageGb: 256,
    askingCents: 35000,
    expectedCents: 52500,
    netProfitCents: 15000,
    maxBidCents: 37500,
    roiPct: 42.9,
    score: 93,
    band: "TOP",
    batteryHealth: 91,
    distanceKm: 34,
    riskLevel: "MEDIUM",
    activationLock: null,
    uncertain: false,
    url: "https://www.marktplaats.nl/",
    isTest: true,
  };
  const { html, text } = buildDealMessage(msg);
  if (channel === "TELEGRAM") {
    const [token, cfg] = await Promise.all([
      getSecret("telegram.botToken"),
      getConfig(),
    ]);
    if (!token || !cfg.telegram.chatId)
      throw new NotifyError("Stel eerst bot-token en chat-ID in", false);
    await sendTelegram({
      token,
      chatId: cfg.telegram.chatId,
      html,
      url: msg.url,
      fetchImpl,
    });
  } else {
    const hook = await getSecret("discord.webhookUrl");
    if (!hook)
      throw new NotifyError("Stel eerst een Discord webhook in", false);
    await sendDiscord({ webhookUrl: hook, text, fetchImpl });
  }
}

/** Testpush naar alle (ingeschakelde) apparaten van de gebruiker. */
export async function sendTestPush(
  userId: string,
  push?: PushSender,
): Promise<{ sent: number; failed: number; removed: number }> {
  const msg: DealMessageInput = {
    title: "Testmelding",
    modelLabel: "iPhone 15 Pro",
    storageGb: 256,
    askingCents: 35000,
    expectedCents: 52500,
    netProfitCents: 15000,
    maxBidCents: 37500,
    roiPct: 42.9,
    score: 93,
    band: "TOP",
    distanceKm: 34,
    riskLevel: "LOW",
    uncertain: false,
    url: "https://www.marktplaats.nl/",
    isTest: true,
    definitive: true,
  };
  const results = await sendPushToUser(
    userId,
    buildPushPayload(msg, "/notifications"),
    push,
  );
  if (!results.length)
    throw new NotifyError(
      "Geen pushapparaat ingeschakeld. Activeer eerst pushmeldingen op dit apparaat.",
      false,
    );
  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.removed).length,
    removed: results.filter((r) => r.removed).length,
  };
}
