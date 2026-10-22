import { prisma } from "@/lib/db/client";
import { errMsg, log } from "@/lib/log";
import { registerPurchases, extractMNumbers } from "@/lib/funnel";
import { sendTelegram } from "@/lib/notify/senders";
import { getConfig, getSecret } from "@/lib/settings/store";
import { clearRulesCache } from "./apply";
import { getBasePrices, getRules, saveBasePrices, saveRules } from "./config";

type FetchLike = typeof fetch;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Past eenmaal per kalendermaand het ingestelde percentage toe op alle basisprijzen (en bewaart de wijziging in het logboek). */
export async function applyMonthlyAdjustment(now = new Date()): Promise<{ applied: boolean; changed: number }> {
  const rules = await getRules();
  const m = rules.monthly;
  if (!m.enabled || !m.percent || m.lastAppliedMonth === monthKey(now)) return { applied: false, changed: 0 };
  const factor = 1 + m.percent / 100;
  const prices = await getBasePrices();
  const next = prices.map((p) => ({ ...p, priceEuro: Math.max(0, Math.round(p.priceEuro * factor)) }));
  await saveBasePrices(next, undefined, `maandaanpassing ${m.percent > 0 ? "+" : ""}${m.percent}% (${monthKey(now)})`);
  await saveRules({ ...rules, monthly: { ...m, lastAppliedMonth: monthKey(now) } });
  clearRulesCache();
  return { applied: true, changed: next.length };
}

interface TgUpdate { update_id: number; message?: TgMsg; channel_post?: TgMsg }
interface TgMsg { text?: string; caption?: string; chat?: { id: number | string }; date?: number }

const KEY_OFFSET = "tg:purchases:offset";
const KEY_STATE = "tg:purchases:state";

/**
 * Leest het Telegram-kanaal waarin gekochte advertenties (M-nummers) worden doorgestuurd en registreert ze als aankoop.
 * Stuurt een melding als er te lang niets is doorgestuurd.
 */
export async function pollTelegramPurchases(now = new Date(), fetchImpl: FetchLike = fetch): Promise<{ registered: number; alerted: boolean; error?: string }> {
  const rules = await getRules();
  const t = rules.telegramPurchases;
  if (!t.enabled || !t.chatId) return { registered: 0, alerted: false };
  const [token, cfg] = await Promise.all([getSecret("telegram.botToken"), getConfig()]);
  if (!token) return { registered: 0, alerted: false, error: "Telegram bot-token ontbreekt" };
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) return { registered: 0, alerted: false };
  const offsetRow = await prisma.appSettings.findUnique({ where: { key: KEY_OFFSET } });
  const stateRow = await prisma.appSettings.findUnique({ where: { key: KEY_STATE } });
  const state = (stateRow?.value ?? {}) as { lastAt?: string; alertedAt?: string };
  let offset = typeof (offsetRow?.value as { v?: number } | null)?.v === "number" ? (offsetRow!.value as { v: number }).v : 0;
  let registered = 0;
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0&allowed_updates=${encodeURIComponent('["message","channel_post"]')}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { registered: 0, alerted: false, error: `Telegram API ${res.status}` };
    const body = (await res.json()) as { ok: boolean; result?: TgUpdate[] };
    for (const u of body.result ?? []) {
      offset = Math.max(offset, u.update_id + 1);
      const msg = u.message ?? u.channel_post;
      if (!msg || String(msg.chat?.id) !== String(t.chatId)) continue;
      const text = `${msg.text ?? ""} ${msg.caption ?? ""}`;
      if (!extractMNumbers(text).length) continue;
      const r = await registerPurchases(admin.id, text);
      registered += r.filter((x) => x.created).length;
      state.lastAt = new Date((msg.date ?? now.getTime() / 1000) * 1000).toISOString();
    }
  } catch (e) {
    return { registered, alerted: false, error: errMsg(e) };
  }
  await prisma.appSettings.upsert({ where: { key: KEY_OFFSET }, create: { key: KEY_OFFSET, value: { v: offset } }, update: { value: { v: offset } } });
  if (!state.lastAt) state.lastAt = now.toISOString(); // klok start bij eerste controle
  let alerted = false;
  const silentMs = t.silentDaysAlert * 86400_000;
  const lastAlert = state.alertedAt ? Date.parse(state.alertedAt) : 0;
  if (now.getTime() - Date.parse(state.lastAt) > silentMs && now.getTime() - lastAlert > silentMs && cfg.telegram.chatId) {
    try {
      await sendTelegram({ token, chatId: cfg.telegram.chatId, html: `⚠️ Er zijn ${t.silentDaysAlert} dagen geen gekochte advertenties (M-nummers) doorgestuurd. Stuur de M-nummers van recente aankopen door, zodat de funnel klopt.`, fetchImpl });
      state.alertedAt = now.toISOString();
      alerted = true;
    } catch (e) {
      log("warn", "Telegram-herinnering M-nummers mislukt", { error: errMsg(e) });
    }
  }
  await prisma.appSettings.upsert({ where: { key: KEY_STATE }, create: { key: KEY_STATE, value: state }, update: { value: state } });
  return { registered, alerted };
}

export async function runRulesMaintenance(now = new Date()): Promise<void> {
  try { const r = await applyMonthlyAdjustment(now); if (r.applied) log("info", "Maandelijkse prijsaanpassing toegepast", { changed: r.changed }); } catch (e) { log("error", "Maandaanpassing mislukt", { error: errMsg(e) }); }
  try { const r = await pollTelegramPurchases(now); if (r.registered || r.alerted || r.error) log("info", "Telegram M-nummers", { ...r }); } catch (e) { log("error", "Telegram M-nummers mislukt", { error: errMsg(e) }); }
}
