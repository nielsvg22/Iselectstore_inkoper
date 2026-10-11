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

  it("model zonder filterpagina wordt door het vangnet (volledige zoekterm) gedekt, niet bij elke smalle ronde; uit te zetten per profiel", async () => {
    const p = await fastProfile({ op: "AND", children: [{ field: "modelKey", operator: "in", value: ["iphone-15-pro", "iphone-17"] }] });
    await prisma.searchProfile.update({ where: { id: p.id }, data: { sourceConfig: { queries: ["iphone 15 pro", "iphone 17"], category: CAT, fastMode: true, fetchDetails: false } } });
    stub();
    await runProfileCheck(p.id); // vangnet-run: alle zoektermen
    expect(paths.some((x) => x.includes("/q/iphone+17"))).toBe(true);
    await runProfileCheck(p.id); // smalle ronde
    paths.length = 0;
    clearPageCache();
    await runProfileCheck(p.id);
    expect(paths).toContain(`/l/${CAT}/f/iphone-15-pro/14053/`);
    expect(paths.some((x) => x.includes("/q/"))).toBe(false);

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

import { estimateRounds, getSliceState, selectSlices, type SliceState } from "@/lib/sources/slice-plan";
import { POST as melderPost } from "@/app/api/profiles/iphone-melder/route";
import { getConfig } from "@/lib/settings/store";
import { ctx, req } from "../helpers";

describe("rondlopende planning (selectie)", () => {
  const sl = (n: string, priority?: "high" | "normal") => ({ url: `https://x/${n}/`, label: n, priority });
  const T = { highMs: 3 * 60_000, normalMs: 20 * 60_000 };
  const now = Date.now();
  const st = (mins: number, pages = 2): SliceState[string] => ({ at: new Date(now - mins * 60_000).toISOString(), pages, total: pages * 30 });

  it("nooit bekeken eerst; daarna de grootste achterstand t.o.v. het doel; prioriteit wint bij gelijke leeftijd; paginabudget wordt gerespecteerd", () => {
    const slices = [sl("a", "high"), sl("b", "normal"), sl("c", "normal"), sl("d", "high")];
    const state: SliceState = { a: st(1), b: st(5), c: st(30), d: st(4) };
    const norm = Object.fromEntries(Object.entries(state).map(([k, v]) => [`https://x/${k}/`, v]));
    // d: 4/3=1.33, a: 1/3=0.33, c: 30/20=1.5, b: 5/20=0.25 → c, d, a, b
    expect(selectSlices(slices, norm, now, 4, T).map((s) => s.label)).toEqual(["c", "d"]); // 2+2 pagina's = budget
    expect(selectSlices(slices, norm, now, 100, T).map((s) => s.label)).toEqual(["c", "d", "a", "b"]);
    const fresh = selectSlices(slices, { ...norm, "https://x/b/": undefined as never }, now, 2, T);
    expect(fresh.map((s) => s.label)).toEqual(["b"]); // nooit bekeken gaat voor
    expect(selectSlices(slices, {}, now, 1, T)).toHaveLength(1); // altijd minstens één, ook bij klein budget
  });

  it("rondetijd: pagina's ÷ budget × interval", () => {
    const slices = [sl("a", "high"), sl("b"), sl("c")];
    const state: SliceState = Object.fromEntries(slices.map((s) => [s.url, { at: new Date().toISOString(), pages: 4, total: 120 }]));
    expect(estimateRounds(slices, state, 12, 60)).toMatchObject({ slices: 3, pages: 12, fullRoundMin: 1, highRoundMin: 1 });
    expect(estimateRounds(slices, state, 4, 60)).toMatchObject({ fullRoundMin: 3, highRoundMin: 1 });
  });
});

describe("iPhone-melder en rondlopend crawlen", () => {
  it("preset maakt per iPhone-model een eigen profiel (categorie iPhone) plus een restprofiel, zet de snelle modus aan, is idempotent en alleen voor beheerders", async () => {
    const { user, cookie } = await makeUser();
    const r1 = await melderPost(req("/api/profiles/iphone-melder", { method: "POST", cookie, body: {} }));
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { created: boolean; models: number; createdModels: number };
    expect(j1).toMatchObject({ created: true });
    expect(j1.models).toBeGreaterThan(20);
    const r2 = await melderPost(req("/api/profiles/iphone-melder", { method: "POST", cookie, body: {} }));
    expect(((await r2.json()) as { createdModels: number }).createdModels).toBe(0);
    const ps = await prisma.searchProfile.findMany({ where: { userId: user.id } });
    expect(ps).toHaveLength(j1.models + 1);
    type Sc = { fastMode: boolean; sliceModels?: string[]; sliceStorages?: number[]; tier: string; group: string; auto: boolean };
    const pro = ps.find((p) => p.name === "iPhone 15 Pro")!;
    expect(pro.sourceConfig as Sc).toMatchObject({ fastMode: true, sliceModels: ["iphone-15-pro"], sliceStorages: [64, 128, 256, 512, 1024], tier: "high", group: "iPhone", auto: true });
    expect((ps.find((p) => p.name === "iPhone 11")!.sourceConfig as Sc).tier).toBe("normal");
    expect(ps.every((p) => (p.sourceConfig as Sc).group === "iPhone" && p.notifyEnabled && p.notifyMinScore === 0)).toBe(true);
    const rest = ps.find((p) => p.name === "iPhone – overige modellen")!;
    expect((rest.sourceConfig as Sc).sliceModels).toBeUndefined();
    expect((await getConfig(true)).scheduler.fast.enabled).toBe(true);
    const other = await makeUser("USER", "gewoon@example.com");
    expect((await melderPost(req("/api/profiles/iphone-melder", { method: "POST", cookie: other.cookie, body: {} }))).status).toBe(403);
    expect(ctx).toBeDefined();
  });

  it("elke controle pakt binnen het paginabudget de slices die het eerst aan de beurt zijn (prioriteit eerst) en onthoudt wat bekeken is", async () => {
    const { user } = await makeUser();
    await saveConfig({ scheduler: { fast: { enabled: true, pagesPerRun: 8, fullSearchEveryMinutes: 60, priorityEveryMinutes: 3, normalEveryMinutes: 20 } } });
    const p = await prisma.searchProfile.create({
      data: {
        userId: user.id, name: "Melder", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: [],
        sourceConfig: { queries: ["iphone"], category: CAT, fastMode: true, fetchDetails: false, baselineAt: new Date(Date.now() - 3600_000).toISOString(), sliceModels: ["iphone-15-pro", "iphone-15-pro-max"], sliceStorages: [256, 512], priorityModels: ["iphone-15-pro"] },
      },
    });
    await saveTree(p.id, { op: "AND", children: [] });
    stub();
    await runProfileCheck(p.id); // vangnet (eerste run)
    const fetched = async () => {
      paths.length = 0;
      clearPageCache();
      await runProfileCheck(p.id);
      return [...new Set(paths.filter((x) => x.includes("/f/")).map((x) => x.replace(/p\/\d+\//, "")))].sort();
    };
    const one = await fetched();
    expect(one).toEqual([`/l/${CAT}/f/256-gb+iphone-15-pro/12825+14053/`, `/l/${CAT}/f/512-gb+iphone-15-pro/12826+14053/`]); // prioriteitsmodel eerst (2 × onbekend = 4 pagina's) binnen het budget van 8
    const two = await fetched();
    expect(two).toEqual([`/l/${CAT}/f/256-gb+iphone-15-pro-max/12825+14054/`, `/l/${CAT}/f/512-gb+iphone-15-pro-max/12826+14054/`]); // nu de overige
    expect(Object.keys(await getSliceState(p.id))).toHaveLength(4);
    // 4 minuten later is het prioriteitsmodel weer aan de beurt (doel 3 min), de overige nog niet (doel 20 min)
    const st = await getSliceState(p.id);
    const aged = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, { ...v, at: new Date(Date.now() - (k.includes("-max/") ? 4 : 4) * 60_000).toISOString() }]));
    await prisma.appSettings.update({ where: { key: `slice:state:${p.id}` }, data: { value: aged } });
    await saveConfig({ scheduler: { fast: { pagesPerRun: 4 } } });
    const three = await fetched();
    expect(three).toEqual([`/l/${CAT}/f/256-gb+iphone-15-pro/12825+14053/`, `/l/${CAT}/f/512-gb+iphone-15-pro/12826+14053/`]); // alleen de prioriteitsslices zijn al weer aan de beurt
  });
});

import { ensureDefaultProfiles } from "@/lib/provision";

describe("automatisch op de server aanmaken (geen handwerk)", () => {
  it("wacht tot er een beheerder is, maakt dan één keer de iPhone-melder en zet de snelle modus aan; verwijderen wordt gerespecteerd", async () => {
    expect(await ensureDefaultProfiles()).toBe("wacht-op-beheerder");
    expect(await prisma.searchProfile.count()).toBe(0);
    const { user } = await makeUser("ADMIN", "eerste@example.com");
    expect(await ensureDefaultProfiles()).toBe("gedaan");
    const ps = await prisma.searchProfile.findMany({ where: { userId: user.id } });
    expect(ps.map((p) => p.name)).toContain("iPhone 16 Pro Max");
    expect(ps.length).toBeGreaterThan(20);
    expect((ps.find((p) => p.name === "iPhone 16 Pro Max")!.sourceConfig as { fastMode: boolean; sliceModels: string[] })).toMatchObject({ fastMode: true, sliceModels: ["iphone-16-pro-max"] });
    const cfg = await getConfig(true);
    expect(cfg.scheduler.fast).toMatchObject({ enabled: true, maxRequestsPerMinute: 12 });
    expect(await ensureDefaultProfiles()).toBe("al-gedaan");
    // gebruiker verwijdert het profiel: niet opnieuw automatisch aanmaken
    await prisma.searchProfile.deleteMany();
    expect(await ensureDefaultProfiles()).toBe("al-gedaan");
    expect(await prisma.searchProfile.count()).toBe(0);
  });

  it("past een bewust ingestelde paginarem niet aan", async () => {
    await makeUser("ADMIN", "tweede@example.com");
    await saveConfig({ scheduler: { fast: { maxRequestsPerMinute: 4 } } });
    await ensureDefaultProfiles();
    expect((await getConfig(true)).scheduler.fast.maxRequestsPerMinute).toBe(4);
  });
});
