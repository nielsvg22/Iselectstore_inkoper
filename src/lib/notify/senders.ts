import { errMsg } from "../log";
import { redact } from "../security/crypto";

type FetchLike = typeof fetch;

export class NotifyError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

export async function sendTelegram(opts: { token: string; chatId: string; html: string; url?: string; fetchImpl?: FetchLike }) {
  const f = opts.fetchImpl ?? fetch;
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(opts.token)) throw new NotifyError("Ongeldig Telegram bot-tokenformaat", false);
  if (!opts.chatId) throw new NotifyError("Telegram Chat ID ontbreekt", false);
  let res: Response;
  try {
    res = await f(`https://api.telegram.org/bot${opts.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.html,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        ...(opts.url && /^https?:\/\//.test(opts.url) ? { reply_markup: { inline_keyboard: [[{ text: "Bekijk advertentie", url: opts.url }]] } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new NotifyError(redact(`Telegram niet bereikbaar: ${errMsg(e)}`), true);
  }
  if (!res.ok) {
    let desc = "";
    try {
      desc = ((await res.json()) as { description?: string }).description ?? "";
    } catch {
      /* negeren */
    }
    throw new NotifyError(`Telegram API ${res.status}${desc ? `: ${desc}` : ""}`, res.status === 429 || res.status >= 500);
  }
}

export async function sendDiscord(opts: { webhookUrl: string; text: string; fetchImpl?: FetchLike }) {
  const f = opts.fetchImpl ?? fetch;
  if (!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(opts.webhookUrl)) throw new NotifyError("Ongeldige Discord webhook-URL", false);
  let res: Response;
  try {
    res = await f(opts.webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: opts.text.slice(0, 1900), allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new NotifyError(redact(`Discord niet bereikbaar: ${errMsg(e)}`), true);
  }
  if (!res.ok) throw new NotifyError(`Discord ${res.status}`, res.status === 429 || res.status >= 500);
}
