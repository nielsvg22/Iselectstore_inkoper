import { errMsg, log } from "@/lib/log";
import { offerOverview } from "@/lib/funnel";
import { sendTelegram } from "@/lib/notify/senders";
import { getConfig, getSecret } from "@/lib/settings/store";
import { getRules, saveRules } from "./config";
import { IPHONE_RELEASE } from "./tables";

type FetchLike = typeof fetch;

const delta = (cur: number | null, prev: number | null) => (cur == null || prev == null || cur === prev ? "" : ` (${cur > prev ? "+" : ""}${cur - prev})`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Waarschuwing in de maanden voor een nieuwe iPhone-serie (september): oudere generaties worden dan goedkoper en het aanbod stijgt sterk. */
export function releaseWarning(now: Date, fromMonth: number): string | null {
  if (!fromMonth) return null;
  const m = now.getUTCMonth() + 1;
  if (m < fromMonth || m > 10) return null;
  const years = Object.values(IPHONE_RELEASE).map((r) => Number(r.slice(0, 4)));
  const newest = Math.max(...years);
  const when = m >= 9 ? "is net uit of komt eraan" : "komt in september";
  return `📱 Nieuwe iPhone-serie ${when}. Verwacht een vloed aan aanbod (vooral van de vorige generatie) en dalende marktprijzen. Scherp de zoekfilters en basisprijzen van de vorige generatie nu al aan, niet pas als er duizenden meldingen zijn. Meld ook alvast extra toestellen aan bij de doorverkoper. (Laatst bekende serie in het systeem: ${newest}.)`;
}

export function formatDigest(rows: Awaited<ReturnType<typeof offerOverview>>["rows"], days: number): string {
  const top = rows.filter((r) => r.received > 0 || r.prev.received > 0).slice(0, 15);
  if (top.length === 0) return `📊 Aanbodoverzicht (${days} dagen): geen advertenties ontvangen.`;
  const lines = top.map((r) =>
    `<b>${esc(r.label)}</b>: ${r.received}${delta(r.received, r.prev.received)} ontvangen, ${r.withPrice}${delta(r.withPrice, r.prev.withPrice)} met prijs, bieden-vanaf-0: ${r.bidZero}${delta(r.bidZero, r.prev.bidZero)}, vraag gem. ${r.avgAsk != null ? "€" + r.avgAsk : "–"}${delta(r.avgAsk, r.prev.avgAsk)}, bieden vanaf gem. ${r.avgBid != null ? "€" + r.avgBid : "–"}${delta(r.avgBid, r.prev.avgBid)}`);
  return `📊 <b>Aanbodoverzicht, laatste ${days} dagen</b> (tussen haakjes: verschil met de periode ervoor)\n\n${lines.join("\n")}\n\nStijgt het aanbod van een model sterk? Dan staat het zoekfilter waarschijnlijk te hoog of te ruim.`;
}

/** Stuurt elke `everyDays` dagen het aanbodoverzicht per Telegram, en eenmaal per jaar de release-waarschuwing. */
export async function sendDigestIfDue(now = new Date(), fetchImpl: FetchLike = fetch): Promise<{ sent: boolean; warned: boolean; error?: string }> {
  const rules = await getRules();
  const d = rules.digest;
  if (!d.enabled) return { sent: false, warned: false };
  const [token, cfg] = await Promise.all([getSecret("telegram.botToken"), getConfig()]);
  const chatId = cfg.telegram.chatId;
  if (!token || !chatId) return { sent: false, warned: false, error: "Telegram niet ingesteld" };
  let sent = false, warned = false;
  try {
    const due = !d.lastSentAt || now.getTime() - Date.parse(d.lastSentAt) >= d.everyDays * 86400_000;
    const warn = releaseWarning(now, d.releaseWarnFromMonth);
    const warnDue = warn != null && d.releaseWarnedYear !== now.getUTCFullYear();
    let next = d;
    if (due) {
      const o = await offerOverview(d.everyDays, now);
      await sendTelegram({ token, chatId, html: formatDigest(o.rows, d.everyDays), fetchImpl });
      next = { ...next, lastSentAt: now.toISOString() };
      sent = true;
    }
    if (warnDue) {
      await sendTelegram({ token, chatId, html: warn!, fetchImpl });
      next = { ...next, releaseWarnedYear: now.getUTCFullYear() };
      warned = true;
    }
    if (next !== d) await saveRules({ ...rules, digest: next });
  } catch (e) {
    log("warn", "Aanbodoverzicht versturen mislukt", { error: errMsg(e) });
    return { sent, warned, error: errMsg(e) };
  }
  return { sent, warned };
}
