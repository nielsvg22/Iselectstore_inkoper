import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { getSourceMonitor } from "@/lib/source-monitor";
import { setCooldown } from "@/lib/jobs/cooldown";
import { saveConfig, setSecret } from "@/lib/settings/store";
import { tokenFingerprint, OFFICIAL_SOURCE } from "@/lib/sources/marktplaats-official";
import { resetDb, makeUser } from "../helpers";
import { safeFetch } from "@/lib/sources/safe-fetch";

beforeEach(resetDb);
async function setup() {
  const { user } = await makeUser();
  await prisma.searchProfile.create({ data: { userId: user.id, name: "Radar", sourceKind: "SEARCH", sourceConfig: { fastMode: true, smartRadar: true }, lastSuccessAt: new Date() } });
  await prisma.appSettings.create({ data: { key: "worker:heartbeat", value: { at: new Date().toISOString() } } });
}
const html = (m: Awaited<ReturnType<typeof getSourceMonitor>>) => m.sources[0];
describe("alleen-lezen toegangsmonitor", () => {
  it("leest status zonder netwerkrequests of schrijven; een uitgevallen worker blijft zichtbaar", async () => {
    await setup(); const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const before = await prisma.appSettings.count();
      const s = await getSourceMonitor();
      expect(s.worker.healthy).toBe(true); expect(html(s).state).toBe("healthy");
      expect(s.sources[1].state).toBe("disabled"); expect(fetchSpy).not.toHaveBeenCalled();
      expect(await prisma.appSettings.count()).toBe(before);
      await prisma.appSettings.update({ where: { key: "worker:heartbeat" }, data: { value: { at: new Date(Date.now() - 180000).toISOString() } } });
      expect((await getSourceMonitor()).worker.healthy).toBe(false);
    } finally { fetchSpy.mockRestore(); }
  });
  it("toont een gedeelde 403-pauze zelfs als de vorige zoekcontrole nog groen is", async () => {
    await setup(); await setCooldown("marktplaats-search", "HTTP 403");
    expect(html(await getSourceMonitor())).toMatchObject({ state: "forbidden", httpStatus: 403 });
  });
  it("bevestigt herstel pas na een succes na de pauze", async () => {
    await setup();
    await prisma.appSettings.create({ data: { key: "cooldown:marktplaats-search", value: { at: new Date(Date.now() - 120000).toISOString(), until: new Date(Date.now() - 1000).toISOString(), reason: "HTTP 429" } } });
    await prisma.searchProfile.updateMany({ data: { lastSuccessAt: new Date(Date.now() - 60000) } });
    expect(html(await getSourceMonitor()).state).toBe("recovering");
    await prisma.searchProfile.updateMany({ data: { lastSuccessAt: new Date() } });
    expect(html(await getSourceMonitor()).state).toBe("healthy");
  });
  it("leent geen HTML-succes voor de API en lekt geen tokens of fingerprints", async () => {
    await setup(); await saveConfig({ sources: { allowed: ["SEARCH", "PARTNER_API"] }, officialApi: { enabled: true, accessApproved: true } });
    const token = "private-own-oauth-token-for-test"; await setSecret("marktplaats.accessToken", token);
    expect((await getSourceMonitor()).sources[1].state).toBe("unknown");
    await prisma.appSettings.create({ data: { key: `source:${OFFICIAL_SOURCE}:gate`, value: { status: 401, blockedFingerprint: tokenFingerprint(token), nextAt: Date.now() + 900000 } } });
    const s = await getSourceMonitor();
    expect(s.sources[1]).toMatchObject({ state: "unauthorized", httpStatus: 401, pauseUntil: null });
    expect(JSON.stringify(s)).not.toContain(token); expect(JSON.stringify(s)).not.toContain(tokenFingerprint(token));
  });
  it.each([403, 429])("registreert HTTP %i van robots.txt voordat de gewone pagina wordt opgevraagd", async code => {
    // Exercise production recording against a mocked transport and the local test database.
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("denied", { status: code }));
    try {
      await expect(safeFetch("https://www.marktplaats.nl/q/iphone/", { lookup: async () => ["93.184.216.34"], respectRobots: true })).rejects.toThrow("robots.txt niet beschikbaar");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(html(await getSourceMonitor())).toMatchObject({ state: code === 403 ? "forbidden" : "rate_limited", httpStatus: code });
    } finally { spy.mockRestore(); vi.unstubAllEnvs(); }
  });
  it("pauzeert en registreert een HTTP-200 botcontrole", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><h1>Robot check CAPTCHA</h1></html>", { status: 200 }));
    try {
      await expect(safeFetch("https://www.marktplaats.nl/q/iphone/", { lookup: async () => ["93.184.216.34"] })).rejects.toThrow("bron gepauzeerd");
      expect(html(await getSourceMonitor()).state).toBe("challenge");
    } finally { spy.mockRestore(); vi.unstubAllEnvs(); }
  });
});
