/** Controleert tegen de echte (publieke) categoriepagina's welke catalogusmodellen een filterpagina hebben. */
import { execFileSync } from "node:child_process";
import { APPLE_MODELS, CAT } from "../src/lib/catalog/apple";
import { buildSlices, norm, parseFacets, type FacetMap } from "../src/lib/sources/facets";

const curl = (u: string) => execFileSync("curl", ["-s", "-L", "-A", "Mozilla/5.0 (compatible; AppleDealHunter/1.0)", u], { maxBuffer: 30e6 }).toString();

const facets = new Map<string, FacetMap>();
for (const cat of [CAT.iphone, CAT.ipad, CAT.macbook]) {
  facets.set(cat, parseFacets(curl(`https://www.marktplaats.nl/l/${cat}/`), cat));
  execFileSync("sleep", ["3"]);
}
for (const cat of facets.keys()) {
  const f = facets.get(cat)!;
  console.log(`\n${cat}: ${Object.keys(f.models).length} modelfacetten, ${Object.keys(f.storages).length} opslagfacetten`);
  const mine = APPLE_MODELS.filter((m) => m.category === cat);
  const ok = mine.filter((m) => f.models[norm(m.label)]);
  const miss = mine.filter((m) => !f.models[norm(m.label)]);
  console.log(`  catalogus ${mine.length}: ${ok.length} gevonden, ${miss.length} zonder filterpagina`);
  if (miss.length) console.log("  zonder:", miss.slice(0, 40).map((m) => m.label).join(" | "));
}
const r = buildSlices([{ model: { key: "iphone-15-pro", label: "iPhone 15 Pro", category: CAT.iphone }, storages: [256] }, { model: { key: "iphone-16-pro-max", label: "iPhone 16 Pro Max", category: CAT.iphone }, storages: [256, 512] }], facets);
console.log("\nslices:", r.slices, "ontbrekend:", r.missing);

// Echte volledige doorloop van de smalle lijst (alleen publieke pagina's, 3 s pauze tussen pagina's)
import { searchAdapter } from "../src/lib/sources/marktplaats-search";
const curlFetch = (async (u: string) => {
  const out = execFileSync("curl", ["-s", "-A", "Mozilla/5.0 (compatible; AppleDealHunter/1.0)", "-w", "\n__STATUS__%{http_code}", u], { maxBuffer: 30e6 }).toString();
  const i = out.lastIndexOf("\n__STATUS__");
  return new Response(out.slice(0, i), { status: Number(out.slice(i + 11)), headers: { "content-type": "text/html" } });
}) as unknown as typeof fetch;
async function live() {
  const stats: { pages: number; cacheHits: number; total?: number; covered?: number } = { pages: 0, cacheHits: 0 };
  const t = Date.now();
  const ads = await searchAdapter.fetchProfile({ profileId: "x", query: "", config: { queries: ["iphone 15 pro"], category: CAT.iphone }, maxAds: 1000, deferDetails: true, slices: [r.slices[0]], fast: { pages: 15 }, cacheSeconds: 0, stats, fetchImpl: curlFetch, lookup: async () => ["93.184.216.34"] });
  const today = ads.filter((a) => a.publishedAt && Date.now() - a.publishedAt.getTime() < 3600_000).length;
  console.log(`\nLIVE "${r.slices[0].label}": ${ads.length} advertenties, ${stats.pages} pagina's, totaal volgens Marktplaats ${stats.total}, gezien ${stats.covered}, duur ${((Date.now() - t) / 1000).toFixed(1)} s, "Vandaag": ${today}`);
}
void live();
