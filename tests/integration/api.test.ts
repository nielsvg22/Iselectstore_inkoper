import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as setup } from "@/app/api/auth/setup/route";
import { GET as health } from "@/app/api/health/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { GET as listProfiles, POST as createProfile } from "@/app/api/profiles/route";
import { DELETE as delProfile, GET as getProfile, PUT as putProfile } from "@/app/api/profiles/[id]/route";
import { GET as listAds } from "@/app/api/ads/route";
import { GET as getAd, PATCH as patchAd } from "@/app/api/ads/[id]/route";
import { POST as reanalyze } from "@/app/api/ads/[id]/reanalyze/route";
import { POST as markBought } from "@/app/api/ads/[id]/purchase/route";
import { POST as importFile } from "@/app/api/import/file/route";
import { POST as importUrl } from "@/app/api/import/url/route";
import { POST as importDemo } from "@/app/api/import/demo/route";
import { POST as tick, GET as tickGet } from "@/app/api/jobs/tick/route";
import { GET as status } from "@/app/api/status/route";
import { GET as listPurchases } from "@/app/api/purchases/route";
import { POST as registerSale } from "@/app/api/purchases/[id]/sale/route";
import { GET as comps, POST as addComp } from "@/app/api/market/comparables/route";
import { POST as testNotification } from "@/app/api/settings/test-notification/route";
import { GET as demoImage } from "@/app/api/demo-image/[kind]/route";
import { ctx, makeUser, req, resetDb } from "../helpers";
import { getUserFromToken } from "@/lib/auth";

beforeEach(resetDb);

const j = async (r: Response) => ({ status: r.status, body: await r.json() });

describe("authenticatie en autorisatie", () => {
  it("health is publiek en meldt database", async () => {
    const r = await j(await health());
    expect(r).toEqual({ status: 200, body: { ok: true, db: true } });
  });

  it("alle beschermde endpoints geven 401 zonder sessie", async () => {
    const calls: Array<Promise<Response>> = [
      Promise.resolve(getSettings(req("/api/settings"))), Promise.resolve(putSettings(req("/api/settings", { method: "PUT", body: {} }))),
      Promise.resolve(listProfiles(req("/api/profiles"))), Promise.resolve(createProfile(req("/api/profiles", { method: "POST", body: {} }))),
      Promise.resolve(listAds(req("/api/ads"))), Promise.resolve(getAd(req("/api/ads/x"), ctx({ id: "x" }))),
      Promise.resolve(patchAd(req("/api/ads/x", { method: "PATCH", body: {} }), ctx({ id: "x" }))), Promise.resolve(reanalyze(req("/api/ads/x/reanalyze", { method: "POST" }), ctx({ id: "x" }))),
      Promise.resolve(importFile(req("/api/import/file", { method: "POST", body: {} }))), Promise.resolve(importUrl(req("/api/import/url", { method: "POST", body: {} }))),
      Promise.resolve(importDemo(req("/api/import/demo", { method: "POST", body: {} }))), Promise.resolve(status(req("/api/status"))),
      Promise.resolve(listPurchases(req("/api/purchases"))), Promise.resolve(comps(req("/api/market/comparables"))), Promise.resolve(addComp(req("/api/market/comparables", { method: "POST", body: {} }))),
      Promise.resolve(testNotification(req("/api/settings/test-notification", { method: "POST", body: { channel: "TELEGRAM" } }))),
    ];
    const results = await Promise.all(calls);
    expect(results.map((r) => r.status)).toEqual(results.map(() => 401));
  });

  it("weigert ongeldige of vervalste sessietokens", async () => {
    await makeUser();
    const r = await getSettings(req("/api/settings", { cookie: "adh_session=niet.een.token" }));
    expect(r.status).toBe(401);
    expect(await getUserFromToken("abc")).toBeNull();
  });

  it("inloggen: juiste gegevens geven een httpOnly-cookie, foute geven 401, en brute force wordt beperkt", async () => {
    await makeUser("ADMIN", "me@example.com");
    const bad = await login(req("/api/auth/login", { method: "POST", body: { email: "me@example.com", password: "fout" } }));
    expect(bad.status).toBe(401);
    const ok = await login(req("/api/auth/login", { method: "POST", body: { email: "ME@example.com", password: "correct-horse-battery" } }));
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/adh_session=/);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await login(req("/api/auth/login", { method: "POST", body: { email: "me@example.com", password: "fout" } }))).status;
    expect(last).toBe(429);
    expect(await prisma.auditLog.count({ where: { action: "login.failed" } })).toBeGreaterThan(0);
  });

  it("setup werkt alleen als er nog geen gebruikers zijn", async () => {
    const first = await setup(req("/api/auth/setup", { method: "POST", body: { email: "a@example.com", password: "een-lang-wachtwoord" } }));
    expect(first.status).toBe(200);
    const second = await setup(req("/api/auth/setup", { method: "POST", body: { email: "b@example.com", password: "een-lang-wachtwoord" } }));
    expect(second.status).toBe(403);
    const weak = await setup(req("/api/auth/setup", { method: "POST", body: { email: "c@example.com", password: "kort" } }));
    expect([400, 403]).toContain(weak.status);
    expect(await prisma.user.count()).toBe(1);
  });

  it("afwijzing van cross-origin mutaties (CSRF)", async () => {
    const { cookie } = await makeUser();
    const evil = req("/api/profiles", { method: "POST", cookie, body: { name: "x" }, headers: { origin: "https://evil.example", host: "localhost" } });
    expect((await createProfile(evil)).status).toBe(403);
    const same = req("/api/profiles", { method: "POST", cookie, body: { name: "x" }, headers: { origin: "http://localhost", host: "localhost" } });
    expect((await createProfile(same)).status).toBe(200);
  });

  it("alleen beheerders mogen instellingen wijzigen", async () => {
    const { cookie } = await makeUser("USER", "user@example.com");
    expect((await putSettings(req("/api/settings", { method: "PUT", cookie, body: { config: { demoMode: true } } }))).status).toBe(403);
    expect((await getSettings(req("/api/settings", { cookie }))).status).toBe(200);
  });

  it("gebruikers zien en wijzigen elkaars zoekprofielen niet", async () => {
    const a = await makeUser("ADMIN", "a@example.com");
    const b = await makeUser("ADMIN", "b@example.com");
    const created = await j(await createProfile(req("/api/profiles", { method: "POST", cookie: a.cookie, body: { name: "van A" } })));
    const id = created.body.id as string;
    expect((await getProfile(req(`/api/profiles/${id}`, { cookie: b.cookie }), ctx({ id }))).status).toBe(404);
    expect((await putProfile(req(`/api/profiles/${id}`, { method: "PUT", cookie: b.cookie, body: { name: "gekaapt" } }), ctx({ id }))).status).toBe(404);
    expect((await delProfile(req(`/api/profiles/${id}`, { method: "DELETE", cookie: b.cookie }), ctx({ id }))).status).toBe(404);
    expect((await j(await listProfiles(req("/api/profiles", { cookie: b.cookie })))).body.profiles).toHaveLength(0);
    expect(await prisma.searchProfile.count()).toBe(1);
  });
});

describe("jobs/tick-endpoint", () => {
  it("weigert aanroepen zonder geheim of sessie en accepteert het cron-geheim", async () => {
    expect((await tick(req("/api/jobs/tick", { method: "POST" }))).status).toBe(401);
    expect((await tick(req("/api/jobs/tick", { method: "POST", headers: { authorization: "Bearer fout" } }))).status).toBe(401);
    expect((await tick(req("/api/jobs/tick", { method: "POST", headers: { authorization: "Bearer test-cron-secret-1234567890" } }))).status).toBe(200);
    expect((await tickGet(req("/api/jobs/tick", { headers: { authorization: "Bearer test-cron-secret-1234567890" } }))).status).toBe(200);
  });
});

describe("instellingen en geheimen", () => {
  it("slaat geheimen versleuteld op en geeft ze nooit terug", async () => {
    const { cookie } = await makeUser();
    const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";
    const put = await j(await putSettings(req("/api/settings", { method: "PUT", cookie, body: { config: { telegram: { chatId: "4242" }, targets: { minProfitCents: 12000 } }, secrets: { "telegram.botToken": token, "ai.apiKey": "sk-geheim-geheim-geheim-123456" } } })));
    expect(put.status).toBe(200);
    const raw = JSON.stringify(put.body);
    expect(raw).not.toContain("ABCDEFGHIJ");
    expect(raw).not.toContain("sk-geheim");
    expect(put.body.secrets.find((s: { key: string }) => s.key === "telegram.botToken").isSet).toBe(true);
    const get = await j(await getSettings(req("/api/settings", { cookie })));
    expect(JSON.stringify(get.body)).not.toContain("ABCDEFGHIJ");
    expect(get.body.config.telegram.chatId).toBe("4242");
    expect(get.body.config.targets.minProfitCents).toBe(12000);
    expect(get.body.config.targets.minRoiPct).toBe(25); // defaults blijven behouden
    const row = await prisma.appSettings.findUniqueOrThrow({ where: { key: "secret:telegram.botToken" } });
    expect(JSON.stringify(row.value)).not.toContain("ABCDEFGHIJ");
    expect(row.secret).toBe(true);
    // wissen
    await putSettings(req("/api/settings", { method: "PUT", cookie, body: { secrets: { "telegram.botToken": null } } }));
    expect(await prisma.appSettings.count({ where: { key: "secret:telegram.botToken" } })).toBe(0);
  });

  it("valideert configuratie en weigert onbekende geheime sleutels", async () => {
    const { cookie } = await makeUser();
    expect((await putSettings(req("/api/settings", { method: "PUT", cookie, body: { config: { targets: { minDealScore: 500 } } } }))).status).toBe(400);
    expect((await putSettings(req("/api/settings", { method: "PUT", cookie, body: { secrets: { "evil.key": "x" } } }))).status).toBe(400);
  });

  it("testmelding zonder configuratie geeft een duidelijke fout", async () => {
    const { cookie } = await makeUser();
    const r = await j(await testNotification(req("/api/settings/test-notification", { method: "POST", cookie, body: { channel: "TELEGRAM" } })));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/bot-token/);
  });
});

describe("zoekprofielen via API", () => {
  it("maakt, leest, wijzigt en verwijdert een profiel met AND/OR-regels", async () => {
    const { cookie } = await makeUser();
    const tree = { op: "AND", children: [{ field: "modelKey", operator: "in", value: ["iphone-15-pro"] }, { op: "OR", children: [{ field: "storageGb", operator: "eq", value: 128 }, { field: "storageGb", operator: "eq", value: 256 }] }] };
    const c = await j(await createProfile(req("/api/profiles", { method: "POST", cookie, body: { name: "iPhone 15 Pro inkoop", intervalMinutes: 30, tree } })));
    expect(c.status).toBe(200);
    const id = c.body.id;
    const g = await j(await getProfile(req(`/api/profiles/${id}`, { cookie }), ctx({ id })));
    expect(g.body.tree).toEqual(tree);
    expect(g.body.profile).toMatchObject({ name: "iPhone 15 Pro inkoop", active: true, intervalMinutes: 30 });
    const u = await putProfile(req(`/api/profiles/${id}`, { method: "PUT", cookie, body: { name: "Hernoemd", active: false, tree: { op: "OR", children: [] } } }), ctx({ id }));
    expect(u.status).toBe(200);
    const g2 = await j(await getProfile(req(`/api/profiles/${id}`, { cookie }), ctx({ id })));
    expect(g2.body.profile).toMatchObject({ name: "Hernoemd", active: false });
    expect(g2.body.tree).toEqual({ op: "OR", children: [] });
    expect((await delProfile(req(`/api/profiles/${id}`, { method: "DELETE", cookie }), ctx({ id }))).status).toBe(200);
    expect(await prisma.searchRule.count()).toBe(0);
  });

  it("valideert invoer (naam, interval, regelboom)", async () => {
    const { cookie } = await makeUser();
    expect((await createProfile(req("/api/profiles", { method: "POST", cookie, body: { name: "" } }))).status).toBe(400);
    expect((await createProfile(req("/api/profiles", { method: "POST", cookie, body: { name: "x", intervalMinutes: 1 } }))).status).toBe(400);
    expect((await createProfile(req("/api/profiles", { method: "POST", cookie, body: { name: "x", tree: { op: "AND", children: [{ field: "drop table", operator: "eq" }] } } }))).status).toBe(400);
    expect((await createProfile(req("/api/profiles", { method: "POST", cookie, body: { name: "x", sourceConfig: { urls: ["javascript:alert(1)"] } } }))).status).toBe(400);
  });
});

describe("importeren en advertenties", () => {
  const csv = `id;titel;prijs;url;plaats;omschrijving\nA1;iPhone 14 128GB;450;https://www.marktplaats.nl/v/x/m111-a;Utrecht;Batterij 90% icloud vrij\nA2;MacBook Air M2 16GB 512GB;800;https://www.marktplaats.nl/v/x/m222-b;Breda;Als nieuw`;

  it("importeert CSV, dedupliceert bij herhaling en toont resultaten via de API", async () => {
    const { cookie } = await makeUser();
    const r1 = await j(await importFile(req("/api/import/file", { method: "POST", cookie, body: { content: csv } })));
    expect(r1.body).toMatchObject({ created: 2, updated: 0 });
    const r2 = await j(await importFile(req("/api/import/file", { method: "POST", cookie, body: { content: csv } })));
    expect(r2.body).toMatchObject({ created: 0, updated: 2 });
    expect(await prisma.advertisement.count()).toBe(2);
    // analyseer via tick
    const t = await tick(req("/api/jobs/tick", { method: "POST", cookie }));
    expect(t.status).toBe(200);
    const list = await j(await listAds(req("/api/ads?sort=profit&showBlocked=1", { cookie })));
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].url).toMatch(/^https:\/\/www\.marktplaats\.nl/);
    expect(list.body.items.every((i: { uncertain: boolean }) => i.uncertain)).toBe(true); // geen marktdata => onzeker
  });

  it("meldt fouten bij kapotte bestanden", async () => {
    const { cookie } = await makeUser();
    const r = await j(await importFile(req("/api/import/file", { method: "POST", cookie, body: { content: "{kapot" } })));
    expect(r.status).toBe(400);
  });

  it("URL-import weigert SSRF-doelen en niet-toegestane hosts, zonder netwerkverkeer", async () => {
    const { cookie } = await makeUser();
    const r = await j(await importUrl(req("/api/import/url", { method: "POST", cookie, body: { urls: ["https://169.254.169.254/latest/meta-data", "https://evil.example.com/x", "http://www.marktplaats.nl/v/x/m1-a"] } })));
    expect(r.status).toBe(200);
    expect(r.body.results.every((x: { ok: boolean }) => !x.ok)).toBe(true);
    expect(r.body.results[0].error).toMatch(/lijst|privé|Host/i);
    expect(r.body.results[2].error).toMatch(/https/);
  });

  it("demo-import levert gemarkeerde data; dashboardlijst toont alleen demo in demomodus", async () => {
    const { cookie } = await makeUser();
    const d = await j(await importDemo(req("/api/import/demo", { method: "POST", cookie, body: { action: "load" } })));
    expect(d.body.ads).toBeGreaterThan(10);
    const list = await j(await listAds(req("/api/ads?limit=5", { cookie })));
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.items.every((i: { isDemo: boolean; url: string | null }) => i.isDemo && i.url === null)).toBe(true);
    await importDemo(req("/api/import/demo", { method: "POST", cookie, body: { action: "remove" } }));
    expect((await j(await listAds(req("/api/ads", { cookie })))).body.total).toBe(0);
  });

  it("detail, notities, status, overrides, herberekenen en negeren", async () => {
    const { cookie } = await makeUser();
    await importFile(req("/api/import/file", { method: "POST", cookie, body: { content: csv } }));
    await tick(req("/api/jobs/tick", { method: "POST", cookie }));
    const ad = await prisma.advertisement.findFirstOrThrow({ where: { title: { contains: "iPhone 14" } } });
    const d = await j(await getAd(req(`/api/ads/${ad.id}`, { cookie }), ctx({ id: ad.id })));
    expect(d.body.current).toBeTruthy();
    expect(d.body.risk).toBeTruthy();
    expect(d.body.ad.rawPayload).toBeUndefined();
    const p = await patchAd(req(`/api/ads/${ad.id}`, { method: "PATCH", cookie, body: { notes: "Bellen na 18u", userState: "FAVORITE", overrides: { costs: { repairCents: 7000 } } } }), ctx({ id: ad.id }));
    expect(p.status).toBe(200);
    expect(await prisma.watchlist.count()).toBe(1);
    const re = await j(await reanalyze(req(`/api/ads/${ad.id}/reanalyze`, { method: "POST", cookie }), ctx({ id: ad.id })));
    expect(re.body.ok).toBe(true);
    const cur = await prisma.dealAnalysis.findFirstOrThrow({ where: { adId: ad.id, isCurrent: true } });
    expect((cur.costs as { expected: { repairCents: number } }).expected.repairCents).toBe(7000);
    await patchAd(req(`/api/ads/${ad.id}`, { method: "PATCH", cookie, body: { userState: "IGNORED" } }), ctx({ id: ad.id }));
    expect(await prisma.watchlist.count()).toBe(0);
    const list = await j(await listAds(req("/api/ads?showBlocked=1", { cookie })));
    expect(list.body.items.find((i: { id: string }) => i.id === ad.id)).toBeUndefined();
    expect((await patchAd(req(`/api/ads/${ad.id}`, { method: "PATCH", cookie, body: { overrides: { costs: { repairCents: -5 } } } }), ctx({ id: ad.id }))).status).toBe(400);
    expect((await getAd(req("/api/ads/bestaatniet", { cookie }), ctx({ id: "bestaatniet" }))).status).toBe(404);
  });

  it("status-endpoint toont profielen, bronnen, jobs en of secrets zijn ingesteld (zonder waarden)", async () => {
    const { cookie } = await makeUser();
    const s = await j(await status(req("/api/status", { cookie })));
    expect(s.status).toBe(200);
    expect(s.body.sources.map((x: { id: string }) => x.id)).toContain("manual-url");
    expect(s.body.secrets["telegram.botToken"]).toBe(false);
  });

  it("demo-afbeelding is een veilige SVG", async () => {
    const r = await demoImage(req("/api/demo-image/iphone"), ctx({ kind: "iphone" }));
    expect(r.headers.get("content-type")).toBe("image/svg+xml");
    expect(await r.text()).toContain("VOORBEELDDATA");
    const x = await demoImage(req("/api/demo-image/<script>"), ctx({ kind: "<script>alert(1)</script>" }));
    expect(await x.text()).not.toContain("<script>alert");
  });
});

describe("inkoop- en verkoopregistratie", () => {
  it("registreert inkoop en verkoop, rekent winst uit en voedt de marktwaardering met een gerealiseerde prijs", async () => {
    const { cookie } = await makeUser();
    const csv = `id;titel;prijs;url;plaats;omschrijving\nA1;iPhone 14 128GB;450;https://www.marktplaats.nl/v/x/m111-a;Utrecht;Batterij 90% icloud vrij`;
    await importFile(req("/api/import/file", { method: "POST", cookie, body: { content: csv } }));
    await tick(req("/api/jobs/tick", { method: "POST", cookie }));
    const ad = await prisma.advertisement.findFirstOrThrow();
    const b = await j(await markBought(req(`/api/ads/${ad.id}/purchase`, { method: "POST", cookie, body: { status: "BOUGHT", buyPriceCents: 40000 } }), ctx({ id: ad.id })));
    expect(b.status).toBe(200);
    await prisma.purchase.update({ where: { id: b.body.id }, data: { repairCostCents: 2000, boughtAt: new Date(Date.now() - 10 * 86400000) } });
    const sale = await registerSale(req(`/api/purchases/${b.body.id}/sale`, { method: "POST", cookie, body: { salePriceCents: 55000, soldAt: new Date().toISOString(), extraCostCents: 1000 } }), ctx({ id: b.body.id }));
    expect(sale.status).toBe(200);
    const stats = await j(await listPurchases(req("/api/purchases", { cookie })));
    expect(stats.body.soldCount).toBe(1);
    expect(stats.body.realized).toBe(55000 - 40000 - 2000 - 1000);
    expect(stats.body.avgDays).toBe(10);
    const realized = await prisma.marketComparable.findMany({ where: { kind: "REALIZED" } });
    expect(realized).toHaveLength(1);
    expect(realized[0]).toMatchObject({ modelKey: "iphone-14", priceCents: 55000, storageGb: 128 });
  });

  it("handmatig gerealiseerde verkoopprijzen toevoegen verbetert de waardering", async () => {
    const { cookie } = await makeUser();
    const items = [600, 610, 620, 605, 615].map((p) => ({ modelKey: "iphone-13", storageGb: 128, priceCents: p * 100, kind: "REALIZED" }));
    expect((await j(await addComp(req("/api/market/comparables", { method: "POST", cookie, body: { items } })))).body.added).toBe(5);
    expect((await addComp(req("/api/market/comparables", { method: "POST", cookie, body: { modelKey: "Fout Formaat", priceCents: 100 } }))).status).toBe(400);
    expect((await j(await comps(req("/api/market/comparables?modelKey=iphone-13", { cookie })))).body.items).toHaveLength(5);
  });
});
