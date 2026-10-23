import { beforeEach, describe, expect, it } from "vitest";
import { GET as rulesGet, PUT as rulesPut } from "@/app/api/rules/route";
import { GET as pricesGet, PUT as pricesPut } from "@/app/api/rules/prices/route";
import { POST as testPost } from "@/app/api/rules/test/route";
import { POST as replayPost } from "@/app/api/rules/replay/route";
import { clearRulesCache } from "@/lib/rules/apply";
import { makeUser, req, resetDb } from "../helpers";

beforeEach(async () => { await resetDb(); clearRulesCache(); });

describe("inkoopregels-API", () => {
  it("alleen ingelogd; wijzigen alleen als beheerder", async () => {
    expect((await rulesGet(req("/api/rules"))).status).toBe(401);
    const admin = await makeUser("ADMIN", "a@example.com");
    const user = await makeUser("USER", "u@example.com");
    const cur = ((await (await rulesGet(req("/api/rules", { cookie: user.cookie }))).json()) as { rules: { battery: { excludeBelowPct: number } } }).rules;
    expect(cur.battery.excludeBelowPct).toBe(80);
    expect((await rulesPut(req("/api/rules", { method: "PUT", body: cur, cookie: user.cookie }))).status).toBe(403);
    expect((await pricesPut(req("/api/rules/prices", { method: "PUT", body: { prices: [] }, cookie: user.cookie }))).status).toBe(403);
    const next = { ...cur, battery: { ...cur.battery, excludeBelowPct: 85 } };
    expect((await rulesPut(req("/api/rules", { method: "PUT", body: next, cookie: admin.cookie }))).status).toBe(200);
    expect(((await (await rulesGet(req("/api/rules", { cookie: admin.cookie }))).json()) as { rules: typeof cur }).rules.battery.excludeBelowPct).toBe(85);
    expect((await rulesPut(req("/api/rules", { method: "PUT", body: { ...cur, priceBase: "onzin" }, cookie: admin.cookie }))).status).toBe(400);
  });

  it("basisprijzen opslaan en teruglezen; ongeldige invoer wordt geweigerd", async () => {
    const admin = await makeUser();
    const bad = await pricesPut(req("/api/rules/prices", { method: "PUT", body: { prices: [{ modelKey: "iphone-15", storageGb: 128, priceEuro: -5 }] }, cookie: admin.cookie }));
    expect(bad.status).toBe(400);
    const ok = await pricesPut(req("/api/rules/prices", { method: "PUT", body: { prices: [{ modelKey: "iphone-15", storageGb: 128, priceEuro: 450 }] }, cookie: admin.cookie }));
    expect(ok.status).toBe(200);
    const l = (await (await pricesGet(req("/api/rules/prices", { cookie: admin.cookie }))).json()) as { prices: Array<{ priceEuro: number; kind: string }> };
    expect(l.prices).toEqual([{ modelKey: "iphone-15", storageGb: 128, variant: "", priceEuro: 450, kind: "sell" }]);
  });

  it("tester geeft een volledige opbouw en leest de prijs uit de tekst", async () => {
    const admin = await makeUser();
    await pricesPut(req("/api/rules/prices", { method: "PUT", body: { prices: [{ modelKey: "iphone-15-pro", storageGb: 256, priceEuro: 700 }] }, cookie: admin.cookie }));
    const r = await testPost(req("/api/rules/test", { method: "POST", cookie: admin.cookie, body: { modelKey: "iphone-15-pro", storageGb: 256, batteryPct: 90, distanceKm: 10, text: "Krasvrij. Vraagprijs €400", seller: { ageMonths: 130, reviews: 5, rating: 4.9, verified: true } } }));
    const j = (await r.json()) as { verdict: { status: string; maxSellEuro: number; lines: unknown[] }; priceFromText: { ask: number } };
    expect(j.priceFromText.ask).toBe(400);
    expect(j.verdict.maxSellEuro).toBe(625); // 700 − 75 (90% batterij), krasvrij, verkoper voldoet aan verzendfilter
    expect(["match", "high"]).toContain(j.verdict.status);
    expect((await testPost(req("/api/rules/test", { method: "POST", cookie: admin.cookie, body: { modelKey: "" } }))).status).toBe(400);
  });

  it("controle op bestaande advertenties werkt zonder advertenties en met meegegeven regels", async () => {
    const admin = await makeUser();
    const r = await replayPost(req("/api/rules/replay", { method: "POST", cookie: admin.cookie, body: { limit: 50 } }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { total: number }).total).toBe(0);
  });
});

describe("zoekfilters-API", () => {
  it("importeert een geplakte lijst, bewaart hem en vereist een beheerder", async () => {
    const { GET, PUT, POST } = await import("@/app/api/rules/filters/route");
    const admin = await makeUser("ADMIN", "fa@example.com");
    const user = await makeUser("USER", "fu@example.com");
    const text = "iPhone 13\t128GB\tNormaal\t50\t320\t300\tVraagprijs\tAlle\t0 maanden\nOnbekend model\t1GB\tNormaal\t1\t2\t3\tAlle\tAlle\t0 maanden";
    expect((await POST(req("/api/rules/filters", { method: "POST", body: { text }, cookie: user.cookie }))).status).toBe(403);
    const parsed = (await (await POST(req("/api/rules/filters", { method: "POST", body: { text }, cookie: admin.cookie }))).json()) as { rows: unknown[]; unmatched: string[] };
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.unmatched).toEqual(["Onbekend model"]);
    expect((await PUT(req("/api/rules/filters", { method: "PUT", body: { filters: parsed.rows }, cookie: admin.cookie }))).status).toBe(200);
    const got = (await (await GET(req("/api/rules/filters", { cookie: user.cookie }))).json()) as { filters: Array<{ modelKey: string; maxEuro: number }> };
    expect(got.filters).toMatchObject([{ modelKey: "iphone-13", maxEuro: 320 }]);
    expect((await PUT(req("/api/rules/filters", { method: "PUT", body: { filters: [{ nope: 1 }] }, cookie: admin.cookie }))).status).toBe(400);
  });
});
