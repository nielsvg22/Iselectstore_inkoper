import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET as listFilters, POST as createFilter } from "@/app/api/filters/route";
import { DELETE as delFilter, PUT as putFilter } from "@/app/api/filters/[id]/route";
import { GET as listAds } from "@/app/api/ads/route";
import { POST as importFile } from "@/app/api/import/file/route";
import { POST as tick } from "@/app/api/jobs/tick/route";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { POST as refreshCatalog } from "@/app/api/catalog/refresh/route";
import { ctx, makeUser, req, resetDb } from "../helpers";
import { buildTree, emptyQuick, summarizeFilter, treeToQuick } from "@/lib/profile-quick";
import { FIELD_DEFS } from "@/lib/engines/filters";

beforeEach(resetDb);
const j = async (r: Response) => ({ status: r.status, body: await r.json() });

const tree = (over: Partial<ReturnType<typeof emptyQuick>>) => buildTree({ ...emptyQuick(), ...over }, [], FIELD_DEFS);

describe("Mijn filters (opgeslagen filters)", () => {
  it("maakt, wijzigt en verwijdert een eigen filter; namen zijn uniek per gebruiker", async () => {
    const { cookie } = await makeUser();
    const t = tree({ models: ["iphone-14"], maxPrice: "500" });
    const c = await j(await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "iPhone 14 onder €500", tree: t } })));
    expect(c.status).toBe(200);
    expect((await j(await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "iPhone 14 onder €500", tree: t } })))).status).toBe(409);
    const list = await j(await listFilters(req("/api/filters", { cookie })));
    expect(list.body.filters).toHaveLength(1);
    expect(treeToQuick(list.body.filters[0].tree).quick).toMatchObject({ models: ["iphone-14"], maxPrice: "500" });
    const id = c.body.id as string;
    expect((await putFilter(req(`/api/filters/${id}`, { method: "PUT", cookie, body: { name: "Nieuwe naam", tree: tree({ maxPrice: "300" }) } }), ctx({ id }))).status).toBe(200);
    expect((await j(await listFilters(req("/api/filters", { cookie })))).body.filters[0].name).toBe("Nieuwe naam");
    expect((await delFilter(req(`/api/filters/${id}`, { method: "DELETE", cookie }), ctx({ id }))).status).toBe(200);
    expect(await prisma.savedFilter.count()).toBe(0);
  });

  it("valideert invoer en weigert onbekende velden", async () => {
    const { cookie } = await makeUser();
    expect((await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "", tree: { op: "AND", children: [] } } }))).status).toBe(400);
    expect((await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "x", tree: { op: "AND", children: [{ field: "hack", operator: "eq", value: 1 }] } } }))).status).toBe(400);
    expect((await createFilter(req("/api/filters", { method: "POST", body: { name: "x", tree: { op: "AND", children: [] } } }))).status).toBe(401);
  });

  it("filters zijn privé: andere gebruikers zien, wijzigen of verwijderen ze niet", async () => {
    const a = await makeUser("ADMIN", "a@example.com");
    const b = await makeUser("ADMIN", "b@example.com");
    const id = (await j(await createFilter(req("/api/filters", { method: "POST", cookie: a.cookie, body: { name: "van A", tree: tree({}) } })))).body.id as string;
    expect((await j(await listFilters(req("/api/filters", { cookie: b.cookie })))).body.filters).toHaveLength(0);
    expect((await putFilter(req(`/api/filters/${id}`, { method: "PUT", cookie: b.cookie, body: { name: "gekaapt", tree: tree({}) } }), ctx({ id }))).status).toBe(404);
    expect((await delFilter(req(`/api/filters/${id}`, { method: "DELETE", cookie: b.cookie }), ctx({ id }))).status).toBe(404);
    expect(await prisma.savedFilter.count()).toBe(1);
  });

  it("past een eigen filter toe op de deals (prijs, model, opslag, foto's)", async () => {
    const { cookie } = await makeUser();
    const csv = [
      "id;titel;prijs;url;plaats;omschrijving;fotos",
      "A1;iPhone 14 128GB;450;https://www.marktplaats.nl/v/x/m111-a;Utrecht;Batterij 90% icloud vrij. Ophalen.;https://i.example/1.jpg",
      "A2;iPhone 14 256GB;650;https://www.marktplaats.nl/v/x/m112-b;Breda;Batterij 92% icloud vrij. Ophalen.;https://i.example/2.jpg",
      "A3;MacBook Air M2 16GB 512GB;800;https://www.marktplaats.nl/v/x/m113-c;Zwolle;Als nieuw, icloud vrij. Ophalen.;https://i.example/3.jpg",
      "A4;iPhone 13 128GB;300;https://www.marktplaats.nl/v/x/m114-d;Almere;Batterij 85% icloud vrij. Ophalen.;https://i.example/4.jpg",
    ].join("\n");
    await importFile(req("/api/import/file", { method: "POST", cookie, body: { content: csv } }));
    await tick(req("/api/jobs/tick", { method: "POST", cookie }));
    const all = await j(await listAds(req("/api/ads?showBlocked=1", { cookie })));
    expect(all.body.total).toBe(4);

    const f1 = (await j(await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "iPhone 14 ≤ €500", tree: tree({ models: ["iphone-14"], maxPrice: "500" }) } })))).body.id;
    const r1 = await j(await listAds(req(`/api/ads?showBlocked=1&filter=${f1}`, { cookie })));
    expect(r1.body.total).toBe(1);
    expect(r1.body.items[0].title).toBe("iPhone 14 128GB");

    const f2 = (await j(await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "Alle iPhones", tree: tree({ models: ["iphone-14", "iphone-13"] }) } })))).body.id;
    expect((await j(await listAds(req(`/api/ads?showBlocked=1&filter=${f2}`, { cookie })))).body.total).toBe(3);

    const f3 = (await j(await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "256 GB", tree: tree({ storage: [256] }) } })))).body.id;
    expect((await j(await listAds(req(`/api/ads?showBlocked=1&filter=${f3}`, { cookie })))).body.items.map((i: { title: string }) => i.title)).toEqual(["iPhone 14 256GB"]);

    const f4 = (await j(await createFilter(req("/api/filters", { method: "POST", cookie, body: { name: "Leeg", tree: tree({}) } })))).body.id;
    expect((await j(await listAds(req(`/api/ads?showBlocked=1&filter=${f4}`, { cookie })))).body.total).toBe(4);

    expect((await listAds(req("/api/ads?filter=bestaatniet", { cookie }))).status).toBe(404);
  });

  it("filters van andere gebruikers kunnen niet via de API worden toegepast", async () => {
    const a = await makeUser("ADMIN", "a@example.com");
    const b = await makeUser("ADMIN", "b@example.com");
    const id = (await j(await createFilter(req("/api/filters", { method: "POST", cookie: a.cookie, body: { name: "privé", tree: tree({}) } })))).body.id;
    expect((await listAds(req(`/api/ads?filter=${id}`, { cookie: b.cookie }))).status).toBe(404);
  });

  it("vat een filter leesbaar samen", () => {
    const q = { ...emptyQuick(), models: ["iphone-15-pro"], storage: [128, 256], maxPrice: "400", minProfit: "100", excludeDefects: true };
    expect(summarizeFilter(q, [])).toEqual(["iphone-15-pro", "128 GB/256 GB", "≤ €400", "winst ≥ €100", "geen defecten"]);
    expect(summarizeFilter(emptyQuick(), [])).toEqual([]);
  });
});

describe("catalogus-API", () => {
  it("levert modellen en categorieën aan ingelogde gebruikers; verversen alleen door beheerders", async () => {
    const admin = await makeUser("ADMIN", "admin@example.com");
    const user = await makeUser("USER", "user@example.com");
    expect((await getCatalog(req("/api/catalog"))).status).toBe(401);
    const c = await j(await getCatalog(req("/api/catalog", { cookie: user.cookie })));
    expect(c.body.models.length).toBeGreaterThan(100);
    expect(c.body.categories.source).toBe("ingebouwd");
    expect(c.body.categories.categories.some((x: { path: string }) => x.path === "telecommunicatie/mobiele-telefoons-apple-iphone")).toBe(true);
    expect((await refreshCatalog(req("/api/catalog/refresh", { method: "POST", cookie: user.cookie, body: {} }))).status).toBe(403);
    expect(admin.cookie).toBeTruthy();
  });
});
