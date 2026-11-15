import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveTree, loadTree } from "@/lib/pipeline/tree";
import { APELDOORN_RADAR_NAME } from "@/lib/radar/apeldoorn";
import { ensureTwanProfiles } from "@/lib/radar/twan-profile";
import { twanScope } from "@/lib/radar/twan-scope";
import { saveFilters } from "@/lib/rules/filters";
import { clearRulesCache } from "@/lib/rules/apply";
import { ctx, makeUser, req, resetDb } from "../helpers";
import { POST as createProfile } from "@/app/api/profiles/route";
import { PATCH as patchProfile, PUT as putProfile, DELETE as deleteProfile } from "@/app/api/profiles/[id]/route";
import { POST as groupProfiles } from "@/app/api/profiles/group/route";
import { POST as iphoneMelder } from "@/app/api/profiles/iphone-melder/route";
import { POST as installRadar } from "@/app/api/profiles/apeldoorn-radar/route";

const filter = (modelKey: string, storageGb: number | null) => ({ id: `f-${modelKey}-${storageGb}`, modelKey, variant: "", storageGb, condition: "normal", minEuro: 0, maxEuro: 1500, maxKm: 300, adType: "all", sellerType: "Alle", sellerMinWeeks: 0, sellerMinMonths: 0, active: true, resaleEuro: null, minMarginEuro: null });
const FAMILY_MODEL = (fam: string) => "macbook-air-m2-13";

async function seed(userId: string) {
  const broad = { queries: ["iphone", "macbook", "ipad", "apple watch", "airpods"], sliceModels: ["iphone-11", "iphone-13", "iphone-15-pro"], priorityModels: [], sliceStorages: [64], smartRadar: true };
  const radar = await prisma.searchProfile.create({ data: { userId, name: APELDOORN_RADAR_NAME, active: true, query: "oud", sourceKind: "SEARCH", sourceConfig: broad, intervalMinutes: 5, notifyChannels: [] } });
  await saveTree(radar.id, { op: "AND", children: [{ field: "family", operator: "in", value: ["iphone", "airpods", "watch"] }] });
  const vinted = await prisma.searchProfile.create({ data: { userId, name: "Vinted — Apple (Nederland)", active: true, query: "iphone, airpods", sourceKind: "SEARCH", sourceConfig: { platform: "vinted", queries: ["iphone", "airpods"], fastMode: true }, intervalMinutes: 5, notifyChannels: [] } });
  const custom = await prisma.searchProfile.create({ data: { userId, name: "Mijn eigen iPhone 13 profiel", active: true, query: "iphone 13", sourceKind: "SEARCH", sourceConfig: { queries: ["iphone 13"] }, intervalMinutes: 5, notifyChannels: [] } });
  return { radar, vinted, custom };
}

describe("vast zoekprofiel zoals Twan het wil", () => {
  beforeEach(async () => { delete process.env.ALLOW_CUSTOM_PROFILES; await resetDb(); clearRulesCache(); });
  afterEach(() => { process.env.ALLOW_CUSTOM_PROFILES = "1"; });

  it("volgt de modellenlijst: alleen die modellen, opslagen en zoektermen; iPhone 13 en ouder valt af", async () => {
    const { user } = await makeUser();
    const { radar, vinted, custom } = await seed(user.id);
    await saveFilters([filter("iphone-15-pro", 256), filter("iphone-16", 128), filter("iphone-13", 128)], user.id);
    const r = await ensureTwanProfiles(user.id);
    expect(r.scope).toMatchObject({ queries: ["iphone"], families: ["iphone"], fromList: true, sliceStorages: [128, 256] });
    const sc = (await prisma.searchProfile.findUniqueOrThrow({ where: { id: radar.id } })).sourceConfig as { queries: string[]; sliceModels: string[]; priorityModels: string[] };
    expect(sc.queries).toEqual(["iphone"]);
    expect(sc.sliceModels.sort()).toEqual(["iphone-15-pro", "iphone-16"]); // niet in de lijst of ouder dan 14 valt af
    expect(sc.priorityModels.every((k) => sc.sliceModels.includes(k))).toBe(true);
    expect(await loadTree(radar.id)).toMatchObject({ op: "AND", children: [{ field: "family", operator: "in", value: ["iphone"] }, { field: "blocked", operator: "isFalse" }] });
    expect(((await prisma.searchProfile.findUniqueOrThrow({ where: { id: vinted.id } })).sourceConfig as { queries: string[] }).queries).toEqual(["iphone"]);
    // eigen profiel is gepauzeerd (niet verwijderd); de vaste profielen blijven aan
    expect(await prisma.searchProfile.findUniqueOrThrow({ where: { id: custom.id } })).toMatchObject({ active: false, notifyEnabled: false });
    expect(await prisma.searchProfile.findMany({ where: { active: true }, select: { id: true } })).toHaveLength(2);
    expect(r.deactivated).toBe(1);
  });

  it("idempotent: een tweede keer verandert er niets", async () => {
    const { user } = await makeUser();
    await seed(user.id);
    await saveFilters([filter("iphone-15-pro", 256)], user.id);
    await ensureTwanProfiles(user.id);
    const again = await ensureTwanProfiles(user.id);
    expect(again.updated).toEqual([]);
    expect(again.deactivated).toBe(0);
  });

  it("staan er MacBooks in de lijst, dan komt er een macbook-zoekterm bij", async () => {
    const { user } = await makeUser();
    const { radar } = await seed(user.id);
    await saveFilters([filter("iphone-16", 128), filter(FAMILY_MODEL("x"), 256)], user.id);
    const scope = await twanScope();
    expect(scope.queries).toEqual(["iphone", "macbook"]);
    await ensureTwanProfiles(user.id);
    expect(await loadTree(radar.id)).toMatchObject({ children: [{ field: "family", value: expect.arrayContaining(["iphone", "macbook_air"]) }, { field: "blocked" }] });
  });

  it("zonder lijst: alleen iPhone 14 en nieuwer", async () => {
    const { user } = await makeUser();
    await seed(user.id);
    const scope = await twanScope();
    expect(scope).toMatchObject({ fromList: false, queries: ["iphone"], families: ["iphone"] });
    expect(scope.sliceModels).toContain("iphone-16");
    expect(scope.sliceModels).not.toContain("iphone-13");
    expect(scope.sliceModels).not.toContain("iphone-11");
  });

  it("meldingsvoorkeuren die naar een eigen profiel wijzen, volgen het vaste profiel", async () => {
    const { user } = await makeUser();
    const { radar, vinted, custom } = await seed(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: { profileIds: [custom.id] } } });
    await ensureTwanProfiles(user.id);
    const prefs = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).notifyPrefs as { profileIds: string[] };
    expect(prefs.profileIds.sort()).toEqual([radar.id, vinted.id].sort());
  });

  it("zonder radarprofiel wordt het vaste profiel aangemaakt en blijft Vinted aan", async () => {
    const { user } = await makeUser();
    const vinted = await prisma.searchProfile.create({ data: { userId: user.id, name: "Vinted — Apple (Nederland)", active: true, query: "iphone", sourceKind: "SEARCH", sourceConfig: { platform: "vinted", queries: ["iphone"] }, intervalMinutes: 5, notifyChannels: [] } });
    const r = await ensureTwanProfiles(user.id);
    expect(r.radarId).toBeTruthy();
    expect(await prisma.searchProfile.findUniqueOrThrow({ where: { id: vinted.id } })).toMatchObject({ active: true });
    expect((await prisma.searchProfile.findUniqueOrThrow({ where: { id: r.radarId! } })).sourceConfig).toMatchObject({ queries: ["iphone"] });
  });

  describe("API", () => {
    it("aanmaken, aanpassen, verwijderen, groepen, iPhone-melder en vervangen zijn geweigerd (403)", async () => {
      const { user, cookie } = await makeUser();
      const { radar, custom } = await seed(user.id);
      const body = { name: "x", query: "", sourceKind: "SEARCH", sourceConfig: {}, intervalMinutes: 5, notifyEnabled: true, notifyChannels: [], notifyMinScore: 0, prioritizeNew: true, active: true, tree: { op: "AND", children: [] } };
      const status = async (p: Promise<Response>) => (await p).status;
      expect(await status(createProfile(req("/api/profiles", { method: "POST", cookie, body })))).toBe(403);
      expect(await status(putProfile(req(`/api/profiles/${radar.id}`, { method: "PUT", cookie, body }), ctx({ id: radar.id })))).toBe(403);
      expect(await status(deleteProfile(req(`/api/profiles/${radar.id}`, { method: "DELETE", cookie }), ctx({ id: radar.id })))).toBe(403);
      expect(await status(groupProfiles(req("/api/profiles/group", { method: "POST", cookie, body: { group: "iphone", active: true } })))).toBe(403);
      expect(await status(iphoneMelder(req("/api/profiles/iphone-melder", { method: "POST", cookie, body: {} })))).toBe(403);
      expect(await status(installRadar(req("/api/profiles/apeldoorn-radar", { method: "POST", cookie, body: {} })))).toBe(403);
      expect(await prisma.searchProfile.count()).toBe(3);
      expect((await createProfile(req("/api/profiles", { method: "POST", cookie, body }))).status).toBe(403);
      expect(custom.id).toBeTruthy();
    });

    it("een vast profiel mag wel gepauzeerd en weer aangezet worden, een eigen profiel niet", async () => {
      const { user, cookie } = await makeUser();
      const { radar, custom } = await seed(user.id);
      const off = await patchProfile(req(`/api/profiles/${radar.id}`, { method: "PATCH", cookie, body: { active: false } }), ctx({ id: radar.id }));
      expect(off.status).toBe(200);
      expect((await prisma.searchProfile.findUniqueOrThrow({ where: { id: radar.id } })).active).toBe(false);
      await patchProfile(req(`/api/profiles/${radar.id}`, { method: "PATCH", cookie, body: { active: true } }), ctx({ id: radar.id }));
      expect((await prisma.searchProfile.findUniqueOrThrow({ where: { id: radar.id } })).active).toBe(true);
      expect((await patchProfile(req(`/api/profiles/${custom.id}`, { method: "PATCH", cookie, body: { active: true } }), ctx({ id: custom.id }))).status).toBe(403);
    });

    it("alleen beheerders mogen pauzeren", async () => {
      const { user } = await makeUser();
      const { radar } = await seed(user.id);
      const other = await makeUser("USER", "gewoon@example.com");
      const r = await patchProfile(req(`/api/profiles/${radar.id}`, { method: "PATCH", cookie: other.cookie, body: { active: false } }), ctx({ id: radar.id }));
      expect([403, 404]).toContain(r.status);
    });
  });
});
