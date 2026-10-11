import { modelByKey } from "../catalog/apple";
import { prisma } from "../db/client";
import { isGroup, type Group } from "../engines/filters";
import { getConfig } from "../settings/store";
import { MARKTPLAATS_ORIGIN } from "./marktplaats-search";
import { Throttle } from "../security/ratelimit";
import { safeFetch } from "./safe-fetch";
import { SourceError } from "./types";

/**
 * Marktplaats publiceert in zijn gewone, publieke categoriepagina's "SEO-filterpagina's":
 *   /l/<categorie>/f/<model>+<opslag>/<id>+<id>/      bijv. …/f/256-gb+iphone-15-pro/12825+14053/
 * Die zijn niet verboden in robots.txt (alleen de filterpagina's van verkopersprofielen onder /u/ zijn dat) en geven een veel smallere resultatenlijst
 * (iPhone 15 Pro 256GB: 220 resultaten i.p.v. 2.215 bij een zoekterm) — zodat een controle ze volledig kan doorlopen.
 */
export interface FacetValue {
  slug: string;
  id: number;
  label: string;
}
export interface FacetMap {
  models: Record<string, FacetValue>; // genormaliseerd label → waarde
  storages: Record<string, FacetValue>; // genormaliseerd label ("256gb") → waarde
  fetchedAt: string;
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const TTL = 24 * 3600_000;
const th = new Throttle(3000);

interface FacetGroup { key?: string; attributeGroup?: Array<{ attributeValueId?: number; attributeValueLabel?: string }> }

/** Pure parser (testbaar): haalt model- en opslagfacetten uit de categoriepagina. */
export function parseFacets(html: string, category: string, now = new Date()): FacetMap {
  const slugById = new Map<number, string>();
  const re = new RegExp(`href="/l/${category.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/f/([a-z0-9-]+)/(\\d+)/"`, "g");
  for (const m of html.matchAll(re)) slugById.set(Number(m[2]), m[1]);
  const data = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!data) throw new SourceError("Categoriepagina bevat geen leesbare gegevens (paginastructuur gewijzigd)", false);
  let facets: FacetGroup[] = [];
  try {
    facets = (JSON.parse(data[1]) as { props: { pageProps: { searchRequestAndResponse: { facets: FacetGroup[] } } } }).props.pageProps.searchRequestAndResponse.facets ?? [];
  } catch {
    throw new SourceError("Categoriepagina-data kon niet worden gelezen", false);
  }
  const collect = (key: string) => {
    const out: Record<string, FacetValue> = {};
    for (const a of facets.find((f) => f.key === key)?.attributeGroup ?? []) {
      const id = a.attributeValueId;
      const slug = id != null ? slugById.get(id) : undefined;
      if (id != null && slug && a.attributeValueLabel) out[norm(a.attributeValueLabel)] = { slug, id, label: a.attributeValueLabel };
    }
    return out;
  };
  return { models: collect("type"), storages: collect("storage"), fetchedAt: now.toISOString() };
}

const mem = new Map<string, FacetMap>();

/** Facetten per categorie (24 uur gecachet, in geheugen en database zodat web en worker ze delen). */
export async function getFacets(category: string, deps: { fetchImpl?: typeof fetch; lookup?: (h: string) => Promise<string[]> } = {}, now = new Date()): Promise<FacetMap> {
  const hit = mem.get(category);
  if (hit && now.getTime() - new Date(hit.fetchedAt).getTime() < TTL) return hit;
  const key = `facets:${category}`;
  const row = await prisma.appSettings.findUnique({ where: { key } });
  const saved = row?.value as FacetMap | undefined;
  if (saved && now.getTime() - new Date(saved.fetchedAt).getTime() < TTL) {
    mem.set(category, saved);
    return saved;
  }
  const cfg = await getConfig();
  const res = await safeFetch(`${MARKTPLAATS_ORIGIN}/l/${category}/`, { allowlist: cfg.sources.urlAllowlist, respectRobots: true, fetchImpl: deps.fetchImpl, lookup: deps.lookup, throttle: deps.fetchImpl || process.env.NODE_ENV === "test" ? undefined : th, maxBytes: 4_000_000 });
  if (res.status === 401 || res.status === 403 || res.status === 429) throw new SourceError(`Marktplaats weigert toegang (HTTP ${res.status}). Er wordt niet geprobeerd dit te omzeilen.`, res.status === 429);
  if (res.status >= 400) throw new SourceError(`Marktplaats gaf HTTP ${res.status} voor de categoriepagina`);
  const map = parseFacets(res.text, category, now);
  mem.set(category, map);
  await prisma.appSettings.upsert({ where: { key }, create: { key, value: map as object }, update: { value: map as object } });
  return map;
}
export function clearFacetCache() {
  mem.clear();
}

export interface SliceSpec {
  model: { key: string; label: string; category: string };
  storages: number[]; // leeg = alle opslagformaten
}
export interface Slice {
  url: string;
  label: string;
}

/** Canonieke filter-URL (slugs alfabetisch; ids in dezelfde volgorde) — anders stuurt Marktplaats een redirect. */
export function sliceUrl(category: string, values: FacetValue[]): string {
  const sorted = [...values].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return `${MARKTPLAATS_ORIGIN}/l/${category}/f/${sorted.map((v) => v.slug).join("+")}/${sorted.map((v) => v.id).join("+")}/`;
}

/** Bouwt de smalle resultaatlijsten (model × opslag). Modellen/opslagen zonder facet worden gemeld als `missing`. */
export function buildSlices(specs: SliceSpec[], facets: Map<string, FacetMap>): { slices: Slice[]; missing: SliceSpec["model"][] } {
  const slices: Slice[] = [];
  const missing: SliceSpec["model"][] = [];
  for (const s of specs) {
    const f = facets.get(s.model.category);
    const m = f?.models[norm(s.model.label)];
    if (!f || !m) {
      missing.push(s.model);
      continue;
    }
    if (!s.storages.length) {
      slices.push({ url: sliceUrl(s.model.category, [m]), label: s.model.label });
      continue;
    }
    for (const gb of s.storages) {
      const st = f.storages[norm(gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`)];
      if (!st) {
        // geen opslagfilter beschikbaar: het hele model volgen (breder, maar niets gemist)
        if (!slices.some((x) => x.label === s.model.label)) slices.push({ url: sliceUrl(s.model.category, [m]), label: s.model.label });
        continue;
      }
      slices.push({ url: sliceUrl(s.model.category, [m, st]), label: `${s.model.label} ${gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`}` });
    }
  }
  return { slices, missing };
}

/** Leest uit het filter van een profiel welke modellen (en opslagformaten) gevolgd worden. */
export function sliceSpecsFromTree(tree: Group): SliceSpec[] {
  if (tree.op !== "AND") return [];
  let models: string[] = [];
  let storages: number[] = [];
  for (const n of tree.children) {
    if (isGroup(n)) continue;
    if (n.field === "modelKey" && n.operator === "in" && Array.isArray(n.value)) models = (n.value as string[]).map(String);
    if (n.field === "storageGb" && n.operator === "in" && Array.isArray(n.value)) storages = (n.value as unknown[]).map(Number).filter((x) => Number.isFinite(x));
  }
  const out: SliceSpec[] = [];
  for (const k of models) {
    const m = modelByKey(k);
    if (m && m.category) out.push({ model: { key: m.key, label: m.label, category: m.category }, storages });
  }
  return out;
}

/** Wanneer is voor dit profiel voor het laatst de volledige zoekterm-controle gedaan (vangnet voor advertenties zonder model-/opslagkenmerk)? */
export async function getLastFullSearch(profileId: string): Promise<Date | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: `slice:full:${profileId}` } });
  return row ? new Date((row.value as { at: string }).at) : null;
}
export async function setLastFullSearch(profileId: string, at = new Date()) {
  const key = `slice:full:${profileId}`;
  await prisma.appSettings.upsert({ where: { key }, create: { key, value: { at: at.toISOString() } }, update: { value: { at: at.toISOString() } } });
}
