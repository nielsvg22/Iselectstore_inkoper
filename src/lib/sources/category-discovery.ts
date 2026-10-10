import { APPLE_CATEGORIES, type MarktplaatsCategory } from "../catalog/categories";
import { prisma } from "../db/client";
import { Throttle } from "../security/ratelimit";
import { getConfig } from "../settings/store";
import { safeFetch } from "./safe-fetch";
import { SourceError } from "./types";
import { MARKTPLAATS_ORIGIN } from "./marktplaats-search";

/** Zoektermen waarmee we de Apple-gerelateerde categorieën blootleggen (via de categoriefacetten van de zoekresultaten). */
export const DISCOVERY_QUERIES = ["iphone", "macbook", "ipad", "apple watch", "airpods", "imac", "mac mini", "mac studio", "apple pencil", "magic keyboard", "homepod", "apple tv", "airtag"];

// Alleen hoofdcategorieën waarin Apple-producten thuishoren (voorkomt ruis zoals auto's en boeken)
const ALLOWED_PARENTS = new Set(["telecommunicatie", "computers-en-software", "audio-tv-en-foto", "sieraden-tassen-en-uiterlijk"]);
const MIN_COUNT = 150;
const KEY = "catalog:categories";

interface Facet {
  id: number;
  key: string;
  label: string;
  parentKey: string | false | null;
  histogramCount?: number;
}

/** Leest de categoriefacetten (RelevantCategories) uit een zoekpagina. */
export function parseCategoryFacets(html: string): Facet[] {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new SourceError("Zoekpagina bevat geen leesbare resultaten", false);
  let sr: { facets?: Array<{ key?: string; categories?: Facet[] }> } | undefined;
  try {
    sr = ((JSON.parse(m[1]) as { props?: { pageProps?: { searchRequestAndResponse?: typeof sr } } }).props?.pageProps?.searchRequestAndResponse) ?? undefined;
  } catch {
    throw new SourceError("Zoekpagina-data kon niet worden gelezen", false);
  }
  const f = sr?.facets?.find((x) => x.key === "RelevantCategories");
  return f?.categories ?? [];
}

const DEVICE = /apple|smartwatch|koptelefoon|oordopjes|desktop|macbook|ipad/i;

/** Telt de resultaten per categorie over alle zoektermen op en bewaart alleen relevante Apple-categorieën. */
export function aggregateCategories(perQuery: Facet[][]): MarktplaatsCategory[] {
  const totals = new Map<string, { label: string; count: number }>();
  for (const facets of perQuery) {
    for (const c of facets) {
      if (!c.histogramCount || !c.parentKey || !ALLOWED_PARENTS.has(String(c.parentKey))) continue;
      const path = `${c.parentKey}/${c.key}`;
      const cur = totals.get(path) ?? { label: c.label, count: 0 };
      cur.count += c.histogramCount;
      totals.set(path, cur);
    }
  }
  return [...totals.entries()]
    .filter(([, v]) => v.count >= MIN_COUNT)
    .map(([path, v]) => ({ path, label: v.label.replace(/^Mobiele telefoons \| /, ""), group: (DEVICE.test(v.label) ? "device" : "accessory") as "device" | "accessory", count: v.count }))
    .sort((a, b) => (a.group === b.group ? (b.count ?? 0) - (a.count ?? 0) : a.group === "device" ? -1 : 1));
}

export interface StoredCategories {
  fetchedAt: string | null;
  categories: MarktplaatsCategory[];
  source: "marktplaats" | "ingebouwd";
}

export async function getAppleCategories(): Promise<StoredCategories> {
  const row = await prisma.appSettings.findUnique({ where: { key: KEY } });
  if (row) {
    const v = row.value as unknown as { fetchedAt: string; categories: MarktplaatsCategory[] };
    if (Array.isArray(v.categories) && v.categories.length) return { fetchedAt: v.fetchedAt, categories: v.categories, source: "marktplaats" };
  }
  return { fetchedAt: null, categories: APPLE_CATEGORIES, source: "ingebouwd" };
}

/** Haalt de lijst live op (±13 requests, minstens 3 s tussen requests, robots.txt-conform). */
export async function refreshAppleCategories(opts: { fetchImpl?: typeof fetch; lookup?: (h: string) => Promise<string[]>; gapMs?: number } = {}): Promise<StoredCategories> {
  const cfg = await getConfig();
  const th = new Throttle(opts.gapMs ?? (process.env.NODE_ENV === "test" ? 0 : 3000));
  const perQuery: Facet[][] = [];
  for (const q of DISCOVERY_QUERIES) {
    const url = `${MARKTPLAATS_ORIGIN}/q/${encodeURIComponent(q).replace(/%20/g, "+")}/`;
    const res = await safeFetch(url, { allowlist: cfg.sources.urlAllowlist, respectRobots: true, fetchImpl: opts.fetchImpl, lookup: opts.lookup, throttle: th, maxBytes: 4_000_000 });
    if (res.status === 401 || res.status === 403 || res.status === 429) throw new SourceError(`Marktplaats weigert toegang (HTTP ${res.status}); er wordt niet geprobeerd dit te omzeilen.`);
    if (res.status >= 400) throw new SourceError(`Marktplaats gaf HTTP ${res.status}`);
    perQuery.push(parseCategoryFacets(res.text));
  }
  const categories = aggregateCategories(perQuery);
  if (!categories.some((c) => c.group === "device")) throw new SourceError("Geen Apple-categorieën gevonden; paginastructuur mogelijk gewijzigd", false);
  const fetchedAt = new Date().toISOString();
  await prisma.appSettings.upsert({ where: { key: KEY }, create: { key: KEY, value: { fetchedAt, categories } as object }, update: { value: { fetchedAt, categories } as object } });
  return { fetchedAt, categories, source: "marktplaats" };
}
