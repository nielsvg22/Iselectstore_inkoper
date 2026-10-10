import { parsePriceToCents } from "./listing-parser";
import type { RawAd } from "./types";

/** Minimale RFC4180-CSV-parser (quotes, scheidingsteken , of ;) */
export function parseCsv(text: string): Record<string, string>[] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let cur: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      cur.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      cur.push(f);
      f = "";
      if (cur.some((x) => x.trim() !== "")) rows.push(cur);
      cur = [];
    } else f += c;
  }
  cur.push(f);
  if (cur.some((x) => x.trim() !== "")) rows.push(cur);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k);
    if (hit && o[hit] != null && o[hit] !== "") return o[hit];
  }
  return undefined;
};

export interface FeedParseResult {
  ads: RawAd[];
  errors: Array<{ row: number; message: string }>;
}

export function normalizeFeedRecord(o: Record<string, unknown>, idx: number): RawAd {
  const url = String(pick(o, ["url", "link", "advertentie_url", "vipurl"]) ?? "");
  const title = String(pick(o, ["title", "titel", "name", "naam"]) ?? "").trim();
  if (!title) throw new Error("titel ontbreekt");
  if (!/^https?:\/\//.test(url)) throw new Error("geldige url ontbreekt");
  const idRaw = pick(o, ["id", "externalid", "external_id", "itemid", "advertentie_id"]);
  const priceCents = pick(o, ["pricecents", "price_cents"]);
  const price = pick(o, ["price", "prijs", "vraagprijs", "price_eur"]);
  const imgs = pick(o, ["images", "imageurls", "image_urls", "foto's", "fotos", "image", "afbeeldingen"]);
  const imageUrls = Array.isArray(imgs) ? imgs.map(String) : typeof imgs === "string" ? imgs.split(/[|\s,;]+/).filter((s) => /^https?:\/\//.test(s)) : [];
  const ship = pick(o, ["shipping", "verzending"]);
  const dist = pick(o, ["distancekm", "distance_km", "afstand"]);
  const pub = pick(o, ["publishedat", "published_at", "date", "datum", "published"]);
  return {
    externalId: String(idRaw ?? `feed-${idx}-${Buffer.from(url).toString("base64url").slice(-12)}`).toLowerCase(),
    url,
    title,
    description: String(pick(o, ["description", "omschrijving", "beschrijving"]) ?? ""),
    askingCents: priceCents != null ? Math.round(Number(priceCents)) : parsePriceToCents(price),
    location: (pick(o, ["location", "plaats", "stad", "city"]) as string | undefined) ?? null,
    postalCode: (pick(o, ["postalcode", "postcode"]) as string | undefined) ?? null,
    distanceKm: dist != null && !Number.isNaN(Number(String(dist).replace(",", "."))) ? Number(String(dist).replace(",", ".")) : null,
    category: (pick(o, ["category", "categorie"]) as string | undefined) ?? null,
    sellerType: (pick(o, ["sellertype", "seller_type", "verkoper"]) as string | undefined) ?? null,
    shipping: Array.isArray(ship) ? ship.map(String) : typeof ship === "string" ? ship.split(/[|,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [],
    conditionText: (pick(o, ["condition", "conditie", "staat"]) as string | undefined) ?? null,
    publishedAt: pub && !Number.isNaN(Date.parse(String(pub))) ? new Date(String(pub)) : null,
    imageUrls,
  };
}

/** JSON (array of {items|ads|listings: []}) of CSV -> RawAd[] */
export function parseFeed(text: string, maxItems = 500): FeedParseResult {
  const trimmed = text.trim();
  let records: Record<string, unknown>[] = [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const j = JSON.parse(trimmed) as unknown;
    const obj = j as Record<string, unknown>;
    const arr = Array.isArray(j) ? j : (obj.items ?? obj.ads ?? obj.listings);
    if (!Array.isArray(arr)) throw new Error("JSON bevat geen lijst met advertenties");
    records = arr as Record<string, unknown>[];
  } else {
    records = parseCsv(trimmed);
  }
  const ads: RawAd[] = [];
  const errors: FeedParseResult["errors"] = [];
  records.slice(0, maxItems).forEach((r, i) => {
    try {
      ads.push(normalizeFeedRecord(r, i));
    } catch (e) {
      errors.push({ row: i + 1, message: (e as Error).message });
    }
  });
  return { ads, errors };
}
