import { prisma } from "@/lib/db/client";
import { errMsg, log } from "@/lib/log";
import { sendTelegram } from "@/lib/notify/senders";
import { getConfig, getSecret } from "@/lib/settings/store";
import { getRules } from "./config";

const ACTION = "automsg.prepared";

/** Eerste woord van de verkopersnaam als aanhef; geen naam of een bedrijfsnaam met cijfers/leestekens → leeg. */
export function firstName(name: string | null | undefined): string {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^[\p{L}][\p{L}'-]{1,24}$/u.test(w)) return "";
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Vult {naam} in; zonder naam vervalt de aanhef-spatie netjes ("Een goede dag, wat is…"). */
export function renderTemplate(tpl: string, name: string): string {
  return tpl.replace(/\{naam\}/g, name).replace(/dag ,/g, "dag,").replace(/dag {2,}/g, "dag ");
}

export interface AutoMessageAd { id: string; title: string; url: string; sellerId: string | null; sellerName: string | null; isDemo: boolean }

/**
 * Zet een bericht klaar voor advertenties van de ingestelde verkoper-ID's. Verstuurt NIETS naar Marktplaats:
 * het bericht komt in het logboek en (optioneel) per Telegram bij de beheerder om zelf te plakken en te versturen.
 * Eén keer per advertentie. De sjablonen wisselen om en om.
 */
export async function prepareAutoMessage(ad: AutoMessageAd, verdictStatus: string | null): Promise<{ prepared: boolean; text?: string; reason?: string }> {
  const rules = await getRules();
  const c = rules.autoMessage;
  if (!c.enabled) return { prepared: false, reason: "uit" };
  if (ad.isDemo || !ad.sellerId || !c.sellerIds.includes(ad.sellerId)) return { prepared: false, reason: "verkoper niet in de lijst" };
  if (c.requireMatch && !["match", "high"].includes(verdictStatus ?? "")) return { prepared: false, reason: "advertentie voldoet niet aan de regels" };
  const done = await prisma.auditLog.findFirst({ where: { action: ACTION, entityId: ad.id }, select: { id: true } });
  if (done) return { prepared: false, reason: "al klaargezet" };
  const count = await prisma.auditLog.count({ where: { action: ACTION } });
  const text = renderTemplate(c.templates[count % c.templates.length], firstName(ad.sellerName));
  await prisma.auditLog.create({ data: { action: ACTION, entity: "Advertisement", entityId: ad.id, meta: { text, title: ad.title, url: ad.url, sellerId: ad.sellerId, sellerName: ad.sellerName, template: count % c.templates.length, sent: false } } });
  if (c.notifyTelegram) {
    try {
      const [token, cfg] = await Promise.all([getSecret("telegram.botToken"), getConfig()]);
      if (token && cfg.telegram.chatId) {
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await sendTelegram({ token, chatId: cfg.telegram.chatId, html: `✉️ <b>Auto-bericht klaar</b> (nog niet verstuurd)\n${esc(ad.title)}\n${ad.url}\n\n${esc(text)}` });
      }
    } catch (e) { log("warn", "Telegram auto-bericht mislukt", { error: errMsg(e) }); }
  }
  return { prepared: true, text };
}

export async function recentAutoMessages(limit = 50) {
  const rows = await prisma.auditLog.findMany({ where: { action: ACTION }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => ({ id: r.id, adId: r.entityId, at: r.createdAt.toISOString(), ...(r.meta as { text: string; title: string; url: string; sellerId: string; sellerName: string | null; template: number; sent: boolean }) }));
}
