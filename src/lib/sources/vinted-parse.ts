import { SourceError, type RawAd } from "./types";

/**
 * Parser voor de openbare Vinted-pagina's (zoekresultaten en advertentiepagina). Vinted levert de gegevens als
 * server-gerenderde JSON in de pagina (`self.__next_f.push`); er wordt niets anders gebruikt dan wat een gewone bezoeker ziet.
 * Wat de pagina niet levert (locatie, accountleeftijd, exacte plaatsingsdatum) blijft null en wordt nooit aangenomen.
 */

export const VINTED_ORIGIN = "https://www.vinted.nl";
export const VINTED_HOSTS = ["www.vinted.nl", "vinted.nl"];

/** Zet de Next.js-streamingchunks weer aan elkaar tot één doorzoekbare tekst. */
export function decodeFlight(html: string): string {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const m of html.matchAll(re)) {
    try { out.push(JSON.parse(`"${m[1]}"`) as string); } catch { /* beschadigde chunk overslaan */ }
  }
  return out.join("");
}

/** Leest het eerste volledige JSON-object/array dat begint op `start` (bracket-matching, bewust van strings). */
export function readJsonAt(text: string, start: number): unknown {
  const open = text[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) throw new SourceError("Onverwacht paginaformaat (geen JSON)", false);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new SourceError("Onvolledige JSON in de pagina", false);
}

const num = (v: unknown): number | null => { const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => (typeof v === "string" && v && v !== "$undefined" ? v : null);
const cents = (amount: unknown): number | null => { const n = num(amount); return n == null ? null : Math.round(n * 100); };
const cleanUrl = (u: string) => (u.startsWith("http") ? u : `${VINTED_ORIGIN}${u}`).split("?")[0];

export interface VintedPage { ads: RawAd[]; page: number; totalPages: number | null; totalEntries: number | null }

interface CatalogItem {
  id?: number;
  productItem?: {
    id?: number; title?: string; url?: string; favouriteCount?: number;
    price?: { amount?: string; currencyCode?: string }; totalItemPrice?: { amount?: string };
    thumbnailUrl?: string; user?: { id?: number; isBusiness?: boolean };
    photos?: Array<{ url?: string }>; itemBox?: { firstLine?: string; secondLine?: string; accessibilityLabel?: string };
  };
}

/** Zoekresultatenpagina → uniforme advertenties. Gooit een SourceError als de pagina niet het verwachte formaat heeft. */
export function parseCatalogPage(html: string): VintedPage {
  const flight = decodeFlight(html);
  const marker = flight.indexOf('"items":{"items":[');
  if (marker < 0) {
    if (/geo\.captcha-delivery\.com|captcha-delivery/i.test(html.slice(0, 40000))) throw new SourceError("Vinted toont een botcontrole (CAPTCHA). Dit wordt niet omzeild.", false);
    throw new SourceError("Vinted-zoekpagina heeft een onverwacht formaat (geen resultatenlijst)", false);
  }
  const items = readJsonAt(flight, flight.indexOf("[", marker)) as CatalogItem[];
  const pagStart = flight.indexOf('"pagination":', marker);
  const pag = pagStart >= 0 ? (readJsonAt(flight, flight.indexOf("{", pagStart)) as { current_page?: number; total_pages?: number; total_entries?: number }) : {};
  const ads: RawAd[] = [];
  for (const it of items) {
    const p = it.productItem;
    const id = p?.id ?? it.id;
    if (!p || id == null || !p.url || !p.title) continue;
    const price = cents(p.price?.amount);
    const photos = (p.photos ?? []).map((x) => x.url).filter((u): u is string => !!u);
    const images = photos.length ? photos : p.thumbnailUrl ? [p.thumbnailUrl] : [];
    const business = p.user?.isBusiness === true;
    ads.push({
      externalId: String(id),
      url: cleanUrl(p.url),
      title: p.title,
      description: "",
      askingCents: price,
      location: null,
      distanceKm: null,
      category: "vinted",
      sellerType: business ? "business" : "private",
      seller: { id: p.user?.id != null ? String(p.user.id) : null, business, name: null, verified: null, rating: null, reviewCount: null, accountAgeMonths: null, anonymous: null },
      shipping: ["shipping"],
      conditionText: str(p.itemBox?.secondLine),
      publishedAt: null,
      imageUrls: images,
      attributes: {
        platform: "vinted",
        priceType: "FIXED",
        ...(num(p.totalItemPrice?.amount) != null ? { buyerTotalCents: Math.round(num(p.totalItemPrice?.amount)! * 100) } : {}),
        ...(str(p.itemBox?.firstLine) ? { vintedModel: str(p.itemBox?.firstLine)! } : {}),
      },
      detailLoaded: false,
    });
  }
  return { ads, page: pag.current_page ?? 1, totalPages: pag.total_pages ?? null, totalEntries: pag.total_entries ?? null };
}

/** "Geüpload 5 minuten geleden" → tijdstip (bij benadering: de pagina geeft alleen een relatieve tekst). */
export function parseUploaded(value: string | null | undefined, now = new Date()): Date | null {
  const v = (value ?? "").toLowerCase().trim();
  if (!v) return null;
  if (/zojuist|nu\b/.test(v)) return now;
  const m = /(\d+)\s*(seconde|seconden|minuut|minuten|uur|uren|dag|dagen|week|weken|maand|maanden|jaar)/.exec(v) ?? (/^(een|1)\s+(uur|dag|week|maand|jaar)/.exec(v) ?? null);
  if (!m) return null;
  const n = m[1] === "een" ? 1 : Number(m[1]);
  const unit = m[2];
  const ms = /^seconde/.test(unit) ? 1e3 : /^minu/.test(unit) ? 60e3 : /^uur|^uren/.test(unit) ? 3600e3 : /^dag/.test(unit) ? 86400e3 : /^week|^weken/.test(unit) ? 7 * 86400e3 : /^maand/.test(unit) ? 30 * 86400e3 : 365 * 86400e3;
  return new Date(now.getTime() - n * ms);
}

export interface VintedDetail { ad: RawAd; attributes: Record<string, string> }

/** Advertentiepagina → omschrijving, verkoper (aantal beoordelingen + waardering), kenmerken en foto's. */
export function parseItemPage(html: string, url: string, now = new Date()): RawAd {
  const flight = decodeFlight(html);
  const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html);
  let product: { name?: string; description?: string; image?: string; offers?: { price?: number | string; itemCondition?: string }; brand?: { name?: string }; color?: string } = {};
  if (ld) { try { product = JSON.parse(ld[1]); } catch { /* geen bruikbare JSON-LD */ } }
  const idMatch = /\/items\/(\d+)/.exec(url);
  if (!idMatch) throw new SourceError("Geen Vinted-advertentie-URL", false);
  // kenmerken (Staat, Opslagcapaciteit, Batterijconditie, Simlock, Kleur, Geüpload)
  const attrs: Record<string, string> = {};
  const aStart = flight.indexOf('{"data":{"attributes":[');
  if (aStart >= 0) {
    try {
      const block = readJsonAt(flight, aStart) as { data?: { attributes?: Array<{ code?: string; data?: { value?: string } }> } };
      for (const a of block.data?.attributes ?? []) if (a.code && a.data?.value != null) attrs[a.code] = String(a.data.value);
    } catch { /* kenmerken ontbreken: geen gegevens verzinnen */ }
  }
  // verkoper
  let seller: NonNullable<RawAd["seller"]> = { id: null, name: null, verified: null, business: null, anonymous: null, rating: null, reviewCount: null, accountAgeMonths: null };
  let location: string | null = null;
  let lastSeen: string | null = null;
  const sStart = flight.indexOf('{"data":{"badges":[');
  const sIdx = flight.indexOf('"feedback_count"');
  if (sIdx >= 0) {
    const objStart = flight.lastIndexOf('{"data":{', sIdx);
    try {
      const s = readJsonAt(flight, objStart >= 0 ? objStart : sStart) as { data?: { feedback_count?: number; feedback_reputation?: number; name?: string; business?: boolean; user_info?: Array<{ key?: string; text?: string }> } };
      const d = s.data ?? {};
      const rep = num(d.feedback_reputation);
      for (const info of d.user_info ?? []) {
        if (info.key === "location" && info.text) location = info.text.slice(0, 80);
        if (info.key === "last-logged-in" && info.text) lastSeen = info.text.replace(/^laatst gezien:\s*/i, "").slice(0, 40);
      }
      seller = {
        ...seller,
        name: str(d.name),
        business: d.business ?? null,
        reviewCount: num(d.feedback_count),
        rating: rep != null ? Math.round(rep * 5 * 10) / 10 : null,
      };
    } catch { /* verkoperinfo ontbreekt */ }
  }
  const sellerId = /"seller_id":"(\d+)"/.exec(flight)?.[1] ?? null;
  seller.id = sellerId;
  // foto's van déze advertentie (de eerste photos-lijst in de pagina)
  const photos: string[] = [];
  const pStart = flight.indexOf('"photos":[{"dominant_color_opaque"');
  if (pStart >= 0) {
    try {
      const list = readJsonAt(flight, flight.indexOf("[", pStart)) as Array<{ url?: string; full_size_url?: string; thumbnails?: Array<{ type?: string; url?: string; original_size?: boolean }> }>;
      for (const p of list) {
        const big = p.thumbnails?.find((t) => t.original_size)?.url ?? p.full_size_url ?? p.url ?? p.thumbnails?.at(-1)?.url;
        if (big) photos.push(big);
      }
    } catch { /* val terug op de afbeelding uit JSON-LD */ }
  }
  if (!photos.length && product.image) photos.push(product.image);
  const price = num(product.offers?.price);
  const batteryBucket = attrs.battery_health;
  // prijsopbouw: kopersbescherming, verzendkosten en elektronicaverificatie (alleen wat de pagina echt meldt)
  const pricing: Record<string, string | number> = {};
  const svcIdx = flight.indexOf('"services":{"isPickUpOnly"');
  if (svcIdx >= 0) {
    try {
      const svc = readJsonAt(flight, flight.indexOf("{", svcIdx + '"services":'.length)) as {
        isPickUpOnly?: boolean;
        buyerProtection?: { finalPrice?: { amount?: string } } | null;
        shipping?: { finalPrice?: { amount?: string } } | null;
        electronicsVerification?: unknown;
        electronicsVerificationWarranty?: unknown;
      };
      pricing.buyerProtection = svc.buyerProtection ? "yes" : "no";
      const fee = cents(svc.buyerProtection?.finalPrice?.amount);
      if (fee != null) pricing.buyerProtectionCents = fee;
      const ship = cents(svc.shipping?.finalPrice?.amount);
      if (ship != null) pricing.shippingCents = ship;
      pricing.electronicsVerification = svc.electronicsVerification ? "yes" : "no";
      pricing.electronicsWarranty = svc.electronicsVerificationWarranty ? "yes" : "no";
      if (svc.isPickUpOnly === true) pricing.pickUpOnly = "yes";
    } catch { /* prijsopbouw onbekend: bescherming en verificatie blijven 'onbekend' */ }
  }
  return {
    externalId: idMatch[1],
    url: cleanUrl(url),
    title: product.name ?? "",
    description: product.description ?? "",
    askingCents: price != null ? Math.round(price * 100) : null,
    location,
    distanceKm: null,
    sellerType: seller.business ? "business" : "private",
    seller,
    shipping: ["shipping"],
    conditionText: attrs.status ?? null,
    publishedAt: parseUploaded(attrs.upload_date, now),
    imageUrls: photos,
    attributes: {
      platform: "vinted",
      priceType: "FIXED",
      ...pricing,
      ...(lastSeen ? { vintedSellerLastSeen: lastSeen } : {}),
      ...(attrs.internal_memory_capacity ? { vintedStorage: attrs.internal_memory_capacity } : {}),
      ...(batteryBucket ? { vintedBatteryBucket: batteryBucket } : {}),
      ...(attrs.sim_lock ? { vintedSimLock: attrs.sim_lock } : {}),
      ...(attrs.color ? { vintedColor: attrs.color } : {}),
      ...(product.brand?.name ? { vintedBrand: product.brand.name } : {}),
    },
    detailLoaded: true,
  };
}

export function catalogUrl(query: string, opts: { page?: number; priceFrom?: number | null; priceTo?: number | null } = {}): string {
  const p = new URLSearchParams({ search_text: query, order: "newest_first" });
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  if (opts.priceFrom != null) p.set("price_from", String(opts.priceFrom));
  if (opts.priceTo != null) p.set("price_to", String(opts.priceTo));
  if (opts.priceFrom != null || opts.priceTo != null) p.set("currency", "EUR");
  return `${VINTED_ORIGIN}/catalog?${p.toString()}`;
}
