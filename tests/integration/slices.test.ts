import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { buildSlices, clearFacetCache, parseFacets, sliceUrl } from "@/lib/sources/facets";
import { runProfileCheck } from "@/lib/jobs/handlers";
import { saveTree } from "@/lib/pipeline/tree";
import { saveConfig } from "@/lib/settings/store";
import { clearPageCache } from "@/lib/sources/marktplaats-search";
import { makeUser, resetDb } from "../helpers";

vi.mock("node:dns/promises", () => ({ default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }, lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

const CAT = "telecommunicatie/mobiele-telefoons-apple-iphone";
const base = JSON.parse(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(readFileSync("tests/fixtures/mp-search.html", "utf8"))![1]);
const proto = base.props.pageProps.searchRequestAndResponse.listings[1];

function categoryHtml() {
  const data = JSON.parse(JSON.stringify(base));
  Object.assign(data.props.pageProps.searchRequestAndResponse, {
    facets: [
      { key: "type", attributeGroup: [{ attributeValueId: 14053, attributeValueLabel: "iPhone 15 Pro" }, { attributeValueId: 14054, attributeValueLabel: "iPhone 15 Pro Max" }] },
      { key: "storage", attributeGroup: [{ attributeValueId: 12825, attributeValueLabel: "256 GB" }, { attributeValueId: 12826, attributeValueLabel: "512 GB" }] },
    ],
  });
  const links = ["iphone-15-pro/14053", "iphone-15-pro-max/14054", "256-gb/12825", "512-gb/12826"].map((l) => `<a href="/l/${CAT}/f/${l}/">x</a>`).join("");
  return `<html>${links}<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

const TOTAL = 45; // 2 pagina's per smalle lijst
function listPage(prefix: string, n: number) {
  const from = (n - 1) * 30;
  const listings = Array.from({ length: Math.max(0, Math.min(30, TOTAL - from)) }, (_, i) => ({ ...proto, itemId: `m${prefix}${String(from + i).padStart(7, "0")}`, title: `iPhone 15 Pro 256GB ${prefix} ${from + i}`, vipUrl: `/v/telecommunicatie/mobiele-telefoons-apple-iphone/m${prefix}${String(from + i).padStart(7, "0")}-iphone-15-pro-${from + i}` }));
  const d = JSON.parse(JSON.stringify(base));
  Object.assign(d.props.pageProps.searchRequestAndResponse, { listings, totalResultCount: TOTAL, maxAllowedPageNumber: 2 });
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(d)}</script></html>`;
}

let paths: string[] = [];
function stub() {
  paths = [];
  vi.stubGlobal("fetch", async (u: string) => {
    const url = new URL(u);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /lrp/api/search*\nDisallow: /u/*/*/f/*");
    paths.push(url.pathname);
    if (url.pathname === `/l/${CAT}/`) return new Response(categoryHtml(), { headers: { "content-type": "text/html" } });
    const page = Number(/\/p\/(\d+)\//.exec(url.pathname)?.[1] ?? 1);
    if (url.pathname.includes("/f/")) return new Response(listPage("5", page), { headers: { "content-type": "text/html" } });
    return new Response(listPage("9", page), { headers: { "content-type": "text/html" } });
  });
}

beforeEach(async () => {
  await resetDb();
  vi.unstubAllGlobals();
  clearPageCache();
  clearFacetCache();
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 }, scheduler: { fast: { enabled: true, fullSearchEveryMinutes: 10 } } });
});

describe("facetten en slices (puur)", () => {
  it("leest model- en opslagfacetten met slug en id uit de categoriepagina", () => {
    const f = parseFacets(categoryHtml(), CAT);
    expect(f.models.iphone15pro).toMatchObject({ slug: "iphone-15-pro", id: 14053 });
    expect(f.storages["256gb"]).toMatchObject({ slug: "256-gb", id: 12825 });
  });

  it("bouwt canonieke URL's (slugs alfabetisch, ids in dezelfde volgorde) en valt netjes terug", () => {
    const f = parseFacets(categoryHtml(), CAT);
    const facets = new Map([[CAT, f]]);
    expect(sliceUrl(CAT, [f.models.iphone15pro, f.storages["256gb"]])).toBe(`https://www.marktplaats.nl/l/${CAT}/f/256-gb+iphone-15-pro/12825+14053/`);
    const r = buildSlices(
      [
        { model: { key: "iphone-15-pro", label: "iPhone 15 Pro", category: CAT }, storages: [256, 1024] },
        { model: { key: "iphone-17", label: "iPhone 17", category: CAT }, storages: [] },
      ],
      facets,
    );
    expect(r.slices.map((s) => s.label)).toEqual(["iPhone 15 Pro 256GB", "iPhone 15 Pro"]); // 1TB-filter bestaat niet ⇒ heel model
    expect(r.missing.map((m) => m.key)).toEqual(["iphone-17"]);
  });
});

describe("slim zoeken in de snelle modus", () => {
  async function fastProfile(tree: unknown) {
    const { user } = await makeUser();
    const p = await prisma.searchProfile.create({ data: { userId: user.id, name: "Snel", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: [], sourceConfig: { queries: ["iphone 15 pro"], category: CAT, fastMode: true, fetchDetails: false } } });
    await saveTree(p.id, tree);
    return p;
  }
  const tree = { op: "AND", children: [{ field: "modelKey", operator: "in", value: ["iphone-15-pro"] }, { field: "storageGb", operator: "in", value: [256] }] };

  it("eerste controle = volledige zoekterm (vangnet); daarna de smalle filterpagina's met alle pagina's; categoriepagina maar één keer", async () => {
    const p = await fastProfile(tree);
    stub();
    await runProfileCheck(p.id);
    expect(paths.some((x) => x.includes("/q/iphone"))).toBe(true);
    expect(paths.some((x) => x.includes("/f/"))).toBe(false);

    paths.length = 0;
    clearPageCache();
    await runProfileCheck(p.id);
    expect(paths).toContain(`/l/${CAT}/`); // facetten opgehaald
    expect(paths).toContain(`/l/${CAT}/f/256-gb+iphone-15-pro/12825+14053/`);
    expect(paths).toContain(`/l/${CAT}/f/256-gb+iphone-15-pro/12825+14053/p/2/`); // alle pagina's van de smalle lijst
    expect(paths.some((x) => x.includes("/q/iphone"))).toBe(false);
    const run = (await prisma.checkRun.findMany({ where: { profileId: p.id }, orderBy: { startedAt: "desc" }, take: 1 }))[0];
    expect(run).toMatchObject({ totalResults: TOTAL, covered: TOTAL, pages: 2 });

    paths.length = 0;
    clearPageCache();
    await runProfileCheck(p.id);
    expect(paths).not.toContain(`/l/${CAT}/`); // facetten uit de cache
    // na het vangnet-interval weer de volledige zoekterm
    await prisma.appSettings.update({ where: { key: `slice:full:${p.id}` }, data: { value: { at: new Date(Date.now() - 11 * 60_000).toISOString() } } });
    paths.length = 0;
    clearPageCache();
    await runProfileCheck(p.id);
    expect(paths.some((x) => x.includes("/q/iphone"))).toBe(true);
  });

  it("model zonder filterpagina loopt via de zoekterm naast de smalle lijsten mee; uit te zetten per profiel", async () => {
    const p = await fastProfile({ op: "AND", children: [{ field: "modelKey", operator: "in", value: ["iphone-15-pro", "iphone-17"] }] });
    stub();
    await runProfileCheck(p.id); // vangnet-run
    await runProfileCheck(p.id); // slices
    paths.length = 0;
    clearPageCache();
    await runProfileCheck(p.id);
    expect(paths).toContain(`/l/${CAT}/f/iphone-15-pro/14053/`);
    expect(paths.some((x) => x.includes("/q/iphone+17"))).toBe(true);

    await prisma.searchProfile.update({ where: { id: p.id }, data: { sourceConfig: { queries: ["iphone 15 pro"], category: CAT, fastMode: true, fetchDetails: false, sliceSearch: false } } });
    paths.length = 0;
    clearPageCache();
    await runProfileCheck(p.id);
    expect(paths.some((x) => x.includes("/f/"))).toBe(false);
  });

  it("zonder gekozen modellen of buiten de snelle modus verandert er niets", async () => {
    const p = await fastProfile({ op: "AND", children: [] });
    stub();
    await runProfileCheck(p.id);
    await runProfileCheck(p.id);
    expect(paths.some((x) => x.includes("/f/"))).toBe(false);
  });
});
