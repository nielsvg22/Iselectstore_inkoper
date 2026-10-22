import { coordinates } from "../radar/driving";
import { distanceFromApeldoorn } from "../radar/safety";
import type { RawAd } from "./types";
import { shippingFromDelivery } from "./delivery";

export class ParseError extends Error {}

/** A calendar date or local time without offset is not a publication instant. */
export function publicationPrecision(value: string | null): "exact" | "day" | "unknown" {
  if (!value || Number.isNaN(Date.parse(value))) return "unknown";
  const calendar = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (!calendar || new Date(calendar).toISOString().slice(0, 10) !== calendar) return "unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "day";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? "exact" : "unknown";
}

/** "€ 1.250,00" | "350" | 350 -> cents */
export function parsePriceToCents(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number")
    return Number.isFinite(v) ? Math.round(v * 100) : null;
  const s = String(v).replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  let n: number;
  if (s.includes(",") && s.includes("."))
    n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (s.includes(",")) n = Number(s.replace(",", "."));
  else if (/\.\d{3}$/.test(s)) n = Number(s.replace(".", ""));
  else n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function extractExternalId(url: string): string | null {
  const m = /(?:^|[/-])([ma]\d{6,})(?:[-/?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Volledige advertentietekst uit <div data-collapsable="description">…</div> (tags gestript, entiteiten gedecodeerd). */
export function extractHtmlDescription(html: string): string | null {
  const m =
    /<div[^>]*data-collapsable="description"[^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    );
  if (!m) return null;
  const text = decodeHtml(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 5 ? text.slice(0, 20000) : null;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = re.exec(html);
  const v = m ? (m[1] ?? m[2]) : null;
  return v ? decodeHtml(v) : null;
}

function scriptBlocks(
  html: string,
): Array<{ type: string; body: string; id?: string }> {
  const out: Array<{ type: string; body: string; id?: string }> = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    out.push({
      type: /type=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "",
      id: /id=["']([^"']+)["']/i.exec(attrs)?.[1],
      body: m[2],
    });
  }
  return out;
}

function safeJson(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 12 || node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) yield* walk(x, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  yield o;
  for (const v of Object.values(o)) yield* walk(v, depth + 1);
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function imagesFrom(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string" && /^(https?:)?\/\//.test(u))
      out.push(u.startsWith("//") ? "https:" + u : u);
    else if (u && typeof u === "object") {
      const r = u as Record<string, unknown>;
      push(
        r.url ??
          r.large ??
          r.extraExtraLargeUrl ??
          r.extraLargeUrl ??
          r.mediumUrl,
      );
    }
  };
  for (const k of ["imageUrls", "images", "image", "pictures", "photos"]) {
    const v = o[k];
    if (Array.isArray(v)) v.forEach(push);
    else push(v);
  }
  return [...new Set(out)];
}

function fromListingObject(
  o: Record<string, unknown>,
  pageUrl: string,
): Partial<RawAd> | null {
  const title = asStr(o.title) ?? asStr(o.name);
  const idRaw = asStr(o.itemId) ?? asStr(o.id) ?? asStr(o.sku);
  if (!title) return null;
  const priceInfo = (o.priceInfo ?? o.price) as
    | Record<string, unknown>
    | number
    | string
    | undefined;
  let cents: number | null = null;
  if (priceInfo && typeof priceInfo === "object") {
    if (typeof priceInfo.priceCents === "number")
      cents = Math.round(priceInfo.priceCents);
    else cents = parsePriceToCents(priceInfo.price ?? priceInfo.amount);
    const t = asStr(priceInfo.priceType);
    if (
      t &&
      !["FIXED", "BIDDING", "MIN_BID", "FAST_BID"].includes(t.toUpperCase()) &&
      cents === 0
    )
      cents = null;
  } else cents = parsePriceToCents(priceInfo);
  const loc = (o.location ?? {}) as Record<string, unknown>;
  const seller = (o.sellerInformation ?? o.seller ?? {}) as Record<
    string,
    unknown
  >;
  const attrs: Record<string, string | number> = {};
  if (Array.isArray(o.attributes)) {
    for (const a of o.attributes as Array<Record<string, unknown>>) {
      const k = asStr(a.key) ?? asStr(a.name);
      const v =
        asStr(a.value) ?? (typeof a.value === "number" ? a.value : null);
      if (k && v != null) attrs[k] = v;
    }
  }
  const dist = distanceFromApeldoorn(loc.latitude, loc.longitude);
  const url = asStr(o.vipUrl) ?? asStr(o.url) ?? pageUrl;
  const abs = url.startsWith("/") ? new URL(url, pageUrl).toString() : url;
  const published =
    asStr(o.date) ?? asStr(o.datePublished) ?? asStr(o.publishedAt);
  return {
    externalId: idRaw ? idRaw.toLowerCase() : undefined,
    title,
    description:
      asStr(o.description) ?? asStr(o.categorySpecificDescription) ?? "",
    askingCents: cents,
    location: asStr(loc.cityName) ?? asStr(o.location) ?? null,
    distanceKm: dist,
    seller: {
      id: seller.sellerId != null ? String(seller.sellerId) : null,
      name: asStr(seller.sellerName),
      verified:
        typeof seller.isVerified === "boolean" ? seller.isVerified : null,
      business:
        typeof seller.isBusiness === "boolean" ? seller.isBusiness : null,
      rating:
        typeof seller.rating === "number" &&
        seller.rating >= 0 &&
        seller.rating <= 5
          ? seller.rating
          : null,
      reviewCount:
        typeof seller.reviewCount === "number" && seller.reviewCount >= 0
          ? seller.reviewCount
          : null,
      accountAgeMonths:
        typeof seller.accountAgeMonths === "number" &&
        seller.accountAgeMonths >= 0
          ? seller.accountAgeMonths
          : null,
    },
    sellerType:
      asStr(seller.sellerType) ?? (seller.isVerified ? "verified" : null),
    shipping: shippingFromDelivery(Object.entries(attrs).find(([key]) => key.toLowerCase() === "delivery")?.[1]),
    category: asStr(o.categoryName) ?? asStr(o.category) ?? null,
    conditionText: asStr(o.itemCondition) ?? asStr(o.condition) ?? null,
    publishedAt:
      published && !Number.isNaN(Date.parse(published))
        ? new Date(published)
        : null,
    imageUrls: imagesFrom(o),
    attributes: {
      ...attrs,
      distanceReference: "Apeldoorn",
      ...(coordinates(loc.latitude, loc.longitude) ? { locationLatitude: loc.latitude as number, locationLongitude: loc.longitude as number } : {}),
      publicationPrecision: publicationPrecision(published),
    },
    url: abs,
  };
}

/**
 * Leest één advertentiepagina uit. Strategieën (in volgorde): JSON-LD (schema.org Product),
 * ingebedde JSON-state (__NEXT_DATA__/application/json), OpenGraph-meta.
 *
 * LET OP: deze parser is getest met fixtures en generieke schema.org-/state-structuren;
 * de exacte actuele paginastructuur van Marktplaats is niet verifieerbaar vanuit elke omgeving.
 * Gebruik de pagina Bronnen > "Test URL" om te controleren of uw URL goed wordt uitgelezen.
 */
export function parseListingHtml(html: string, pageUrl: string): RawAd {
  const candidates: Partial<RawAd>[] = [];
  const blocks = scriptBlocks(html);

  for (const b of blocks) {
    if (!/ld\+json/i.test(b.type)) continue;
    const j = safeJson(b.body);
    if (!j) continue;
    for (const o of walk(j)) {
      const t = o["@type"];
      const isProduct =
        t === "Product" || (Array.isArray(t) && t.includes("Product"));
      if (!isProduct) continue;
      const offer = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as
        | Record<string, unknown>
        | undefined;
      const base = fromListingObject(
        {
          ...o,
          price: offer?.price ?? offer?.lowPrice,
          url: asStr(offer?.url) ?? asStr(o.url),
        },
        pageUrl,
      );
      if (base) {
        if (offer?.price != null)
          base.askingCents = parsePriceToCents(offer.price);
        const cond = asStr(offer?.itemCondition) ?? asStr(o.itemCondition);
        if (cond)
          base.conditionText = cond.replace(/^https?:\/\/schema\.org\//, "");
        base.imageUrls = imagesFrom(o);
        candidates.push(base);
      }
    }
  }

  for (const b of blocks) {
    const looksJson = /json/i.test(b.type) || b.id === "__NEXT_DATA__";
    let j: unknown | null = null;
    if (looksJson && !/ld\+json/i.test(b.type)) j = safeJson(b.body);
    else if (/window\.__[A-Z_]+__\s*=\s*\{/.test(b.body)) {
      const s = b.body.indexOf("{");
      j = safeJson(b.body.slice(s).replace(/;\s*$/, ""));
    }
    if (!j) continue;
    for (const o of walk(j)) {
      if (
        ("itemId" in o || "priceInfo" in o) &&
        ("title" in o || "name" in o)
      ) {
        const c = fromListingObject(o, pageUrl);
        if (c) candidates.push(c);
      }
    }
  }

  const og = {
    title: metaContent(html, "og:title"),
    description: metaContent(html, "og:description"),
    image: metaContent(html, "og:image"),
    price:
      metaContent(html, "product:price:amount") ??
      metaContent(html, "og:price:amount"),
    url: metaContent(html, "og:url"),
  };
  if (og.title) {
    candidates.push({
      title: og.title,
      description: og.description ?? "",
      askingCents: parsePriceToCents(og.price),
      imageUrls: og.image ? [og.image] : [],
      url: og.url ?? pageUrl,
    });
  }

  if (!candidates.length)
    throw new ParseError("Geen advertentiegegevens gevonden in de pagina");

  // Volledige beschrijving uit de zichtbare pagina-HTML (JSON-LD en zoekresultaten zijn afgekapt/ingekort)
  const htmlDesc = extractHtmlDescription(html);

  // Rijkste kandidaat eerst, aanvullen met rest
  const score = (c: Partial<RawAd>) =>
    (c.title ? 2 : 0) +
    (c.askingCents != null ? 2 : 0) +
    (c.description ? 1 : 0) +
    (c.imageUrls?.length ? 1 : 0) +
    (c.externalId ? 2 : 0) +
    (c.location ? 1 : 0);
  candidates.sort((a, b) => score(b) - score(a));
  const merged: Partial<RawAd> = {};
  for (const c of candidates) {
    for (const [k, v] of Object.entries(c)) {
      const cur = (merged as Record<string, unknown>)[k];
      const empty =
        cur == null || cur === "" || (Array.isArray(cur) && !cur.length);
      if (empty && v != null && v !== "")
        (merged as Record<string, unknown>)[k] = v;
    }
  }
  if (htmlDesc && htmlDesc.length > (merged.description ?? "").length)
    merged.description = htmlDesc;
  const externalId =
    merged.externalId ??
    extractExternalId(pageUrl) ??
    extractExternalId(merged.url ?? "");
  if (!merged.title) throw new ParseError("Titel ontbreekt");
  if (!externalId)
    throw new ParseError(
      "Kon geen advertentie-ID bepalen uit de URL of pagina",
    );
  return {
    externalId,
    url: merged.url ?? pageUrl,
    title: merged.title,
    description: merged.description ?? "",
    askingCents: merged.askingCents ?? null,
    location: merged.location ?? null,
    postalCode: merged.postalCode ?? null,
    distanceKm: merged.distanceKm ?? null,
    category: merged.category ?? null,
    sellerType: merged.sellerType ?? null,
    seller: merged.seller,
    shipping: merged.shipping ?? [],
    conditionText: merged.conditionText ?? null,
    publishedAt: merged.publishedAt ?? null,
    imageUrls: merged.imageUrls ?? [],
    attributes: merged.attributes ?? {},
  };
}
