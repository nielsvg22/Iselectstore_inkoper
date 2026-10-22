import { prisma } from "@/lib/db/client";

const M_NUMBER = /\bm\d{7,12}\b/gi;

/** Haalt Marktplaats-advertentienummers (m2158666552) uit vrije tekst. */
export function extractMNumbers(text: string): string[] {
  return [...new Set((text.match(M_NUMBER) ?? []).map((m) => m.toLowerCase()))];
}

/** Gebruiker opent de advertentie in de app: alle (nog niet geopende) meldingen voor die advertentie tellen als geopend. */
export async function markOpened(userId: string, adId: string): Promise<number> {
  const r = await prisma.notification.updateMany({ where: { adId, userId, openedAt: null, channel: { in: ["WEBPUSH", "INAPP"] }, status: "SENT" }, data: { openedAt: new Date() } });
  return r.count;
}

/** Gebruiker klikt door naar Marktplaats (via de knop in de app). Telt ook als geopend. */
export async function markClicked(userId: string, adId: string): Promise<number> {
  const now = new Date();
  await prisma.notification.updateMany({ where: { adId, userId, openedAt: null, status: "SENT" }, data: { openedAt: now } });
  const r = await prisma.notification.updateMany({ where: { adId, userId, clickedAt: null, status: "SENT" }, data: { clickedAt: now } });
  return r.count;
}

export interface PurchaseRegistration { mNumber: string; adId: string | null; created: boolean; title: string }

/** Registreert gekochte advertenties op M-nummer (bijv. doorgestuurd via Telegram). Bestaande aankopen worden niet overschreven. */
export async function registerPurchases(userId: string, text: string): Promise<PurchaseRegistration[]> {
  const out: PurchaseRegistration[] = [];
  for (const mNumber of extractMNumbers(text)) {
    const existing = await prisma.purchase.findUnique({ where: { userId_mNumber: { userId, mNumber } } });
    const ad = await prisma.advertisement.findFirst({ where: { externalId: mNumber }, include: { product: { include: { specs: true } } } });
    if (existing) { out.push({ mNumber, adId: existing.adId, created: false, title: existing.title }); continue; }
    const taken = ad ? await prisma.purchase.findUnique({ where: { adId: ad.id } }) : null;
    const storage = ad?.product?.specs.find((s) => s.key === "storageGb")?.value;
    const p = await prisma.purchase.create({
      data: {
        userId, mNumber, status: "BOUGHT", boughtAt: new Date(),
        title: ad?.title ?? mNumber, adId: ad && !taken ? ad.id : null,
        modelKey: ad?.product?.modelKey ?? null, storageGb: storage && /^\d+$/.test(storage) ? Number(storage) : null,
        askingCents: ad?.askingPriceCents ?? null,
      },
    });
    out.push({ mNumber, adId: p.adId, created: true, title: p.title });
  }
  return out;
}

export interface FunnelRow { modelKey: string; label: string; sent: number; opened: number; clicked: number; bought: number }
export interface UnopenedAd { adId: string; title: string; modelKey: string; askEuro: number | null; bidEuro: number | null; sentAt: string }

/** Funnel per model: melding verstuurd → geopend in de app → doorgeklikt naar Marktplaats → gekocht. */
export async function funnelStats(userId: string | null, days: number, now = new Date()): Promise<{ rows: FunnelRow[]; unopened: UnopenedAd[]; totals: Omit<FunnelRow, "modelKey" | "label"> }> {
  const since = new Date(now.getTime() - days * 86400_000);
  const notes = await prisma.notification.findMany({
    where: { channel: { in: ["WEBPUSH", "INAPP"] }, status: "SENT", sentAt: { gte: since }, ...(userId ? { userId } : {}) },
    select: { adId: true, userId: true, channel: true, openedAt: true, clickedAt: true, sentAt: true, ad: { select: { title: true, askingPriceCents: true, rawPayload: true, externalId: true, product: { select: { modelKey: true, modelLabel: true } } } } },
    orderBy: { sentAt: "desc" },
    take: 20000,
  });
  // één regel per (advertentie, gebruiker); push heeft voorrang boven pop-up
  const per = new Map<string, (typeof notes)[number] & { opened: boolean; clicked: boolean }>();
  for (const n of notes) {
    const k = `${n.adId}:${n.userId}`;
    const cur = per.get(k);
    const opened = Boolean(n.openedAt) || Boolean(cur?.opened);
    const clicked = Boolean(n.clickedAt) || Boolean(cur?.clicked);
    if (!cur || (cur.channel !== "WEBPUSH" && n.channel === "WEBPUSH")) per.set(k, { ...n, opened, clicked });
    else per.set(k, { ...cur, opened, clicked });
  }
  const boughtIds = new Set((await prisma.purchase.findMany({ where: { status: { in: ["BOUGHT", "LISTED", "SOLD"] }, OR: [{ adId: { in: [...new Set([...per.values()].map((n) => n.adId))] } }, { mNumber: { not: null } }] }, select: { adId: true, mNumber: true } })).flatMap((p) => [p.adId, p.mNumber].filter(Boolean) as string[]));
  const rows = new Map<string, FunnelRow>();
  const unopened: UnopenedAd[] = [];
  for (const n of per.values()) {
    const key = n.ad.product?.modelKey ?? "onbekend";
    const r = rows.get(key) ?? { modelKey: key, label: n.ad.product?.modelLabel ?? "Onbekend model", sent: 0, opened: 0, clicked: 0, bought: 0 };
    r.sent++;
    if (n.opened) r.opened++;
    if (n.clicked) r.clicked++;
    if (boughtIds.has(n.adId) || boughtIds.has(n.ad.externalId)) r.bought++;
    rows.set(key, r);
    if (!n.opened) {
      const pt = (n.ad.rawPayload as { attributes?: { priceType?: string } } | null)?.attributes?.priceType;
      const euro = n.ad.askingPriceCents != null ? n.ad.askingPriceCents / 100 : null;
      unopened.push({ adId: n.adId, title: n.ad.title, modelKey: key, askEuro: pt === "MIN_BID" ? null : euro, bidEuro: pt === "MIN_BID" ? euro : null, sentAt: (n.sentAt ?? now).toISOString() });
    }
  }
  const list = [...rows.values()].sort((a, b) => b.sent - a.sent);
  const totals = { sent: 0, opened: 0, clicked: 0, bought: 0 };
  for (const r of list) { totals.sent += r.sent; totals.opened += r.opened; totals.clicked += r.clicked; totals.bought += r.bought; }
  return { rows: list, unopened: unopened.slice(0, 200), totals };
}

export interface OfferRow {
  modelKey: string; label: string; received: number; withPrice: number; bidZero: number; avgAsk: number | null; avgBid: number | null;
  prev: { received: number; withPrice: number; bidZero: number; avgAsk: number | null; avgBid: number | null };
  battery: Record<"<80" | "80-84" | "85-89" | "90-94" | "95-100" | "onbekend", number>;
}

const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);

/** Aanbod per model over twee opeenvolgende perioden (bijv. 14 dagen) met veranderingen, plus batterijverdeling. */
export async function offerOverview(days: number, now = new Date()): Promise<{ rows: OfferRow[]; periodDays: number; mpConditions: Record<string, number>; sellerSignals: { total: number; withRating: number; withAge: number } }> {
  const since = new Date(now.getTime() - 2 * days * 86400_000);
  const mid = new Date(now.getTime() - days * 86400_000);
  const ads = await prisma.advertisement.findMany({
    where: { isDemo: false, firstSeenAt: { gte: since }, product: { isNot: null } },
    select: { firstSeenAt: true, askingPriceCents: true, rawPayload: true, conditionText: true, sellerSignals: true, product: { select: { modelKey: true, modelLabel: true, specs: { where: { key: "batteryHealth" }, select: { value: true } } } } },
    take: 50000,
  });
  type Acc = { cur: { n: number; ask: number[]; bid: number[]; zero: number }; prev: { n: number; ask: number[]; bid: number[]; zero: number }; label: string; battery: OfferRow["battery"] };
  const map = new Map<string, Acc>();
  const mp: Record<string, number> = {};
  let withRating = 0, withAge = 0;
  for (const a of ads) {
    const key = a.product!.modelKey;
    const acc = map.get(key) ?? { cur: { n: 0, ask: [], bid: [], zero: 0 }, prev: { n: 0, ask: [], bid: [], zero: 0 }, label: a.product!.modelLabel, battery: { "<80": 0, "80-84": 0, "85-89": 0, "90-94": 0, "95-100": 0, onbekend: 0 } };
    const bucket = a.firstSeenAt >= mid ? acc.cur : acc.prev;
    bucket.n++;
    const pt = (a.rawPayload as { attributes?: { priceType?: string } } | null)?.attributes?.priceType;
    const euro = a.askingPriceCents != null ? a.askingPriceCents / 100 : null;
    if (pt === "MIN_BID") { if (euro && euro > 0) bucket.bid.push(euro); else bucket.zero++; }
    else if (euro && euro > 0) bucket.ask.push(euro);
    if (a.firstSeenAt >= mid) {
      const b = Number(a.product!.specs[0]?.value);
      const k = !Number.isFinite(b) || b <= 0 ? "onbekend" : b < 80 ? "<80" : b < 85 ? "80-84" : b < 90 ? "85-89" : b < 95 ? "90-94" : "95-100";
      acc.battery[k]++;
      const c = a.conditionText ?? "onbekend";
      mp[c] = (mp[c] ?? 0) + 1;
      const sig = (a.sellerSignals ?? {}) as { rating?: number | null; accountAgeMonths?: number | null };
      if (sig.rating != null) withRating++;
      if (sig.accountAgeMonths != null) withAge++;
    }
    map.set(key, acc);
  }
  const rows: OfferRow[] = [...map.entries()].map(([modelKey, a]) => ({
    modelKey, label: a.label, received: a.cur.n, withPrice: a.cur.ask.length + a.cur.bid.length, bidZero: a.cur.zero, avgAsk: avg(a.cur.ask), avgBid: avg(a.cur.bid),
    prev: { received: a.prev.n, withPrice: a.prev.ask.length + a.prev.bid.length, bidZero: a.prev.zero, avgAsk: avg(a.prev.ask), avgBid: avg(a.prev.bid) }, battery: a.battery,
  })).sort((x, y) => y.received - x.received);
  return { rows, periodDays: days, mpConditions: mp, sellerSignals: { total: ads.filter((a) => a.firstSeenAt >= mid).length, withRating, withAge } };
}
