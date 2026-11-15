import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { APELDOORN_RADAR_NAME } from "@/lib/radar/apeldoorn";
import { applyPlatformEnv, parsePlatforms } from "@/lib/radar/platform-switch";
import { getConfig } from "@/lib/settings/store";
import { makeUser, resetDb } from "../helpers";

const radarOf = async (userId: string) => prisma.searchProfile.findFirstOrThrow({ where: { userId, name: APELDOORN_RADAR_NAME } });
const vintedOn = async () => (await getConfig(true)).scheduler.vinted.enabled;

describe("ACTIVE_PLATFORMS", () => {
  it("leest alleen geldige waarden", () => {
    expect(parsePlatforms(undefined)).toBeNull();
    expect(parsePlatforms("  ")).toBeNull();
    expect(parsePlatforms("vinted")).toEqual({ marktplaats: false, vinted: true });
    expect(parsePlatforms("Marktplaats, Vinted")).toEqual({ marktplaats: true, vinted: true });
    expect(parsePlatforms("marktplaats+vinted")).toEqual({ marktplaats: true, vinted: true });
    expect(parsePlatforms("geen")).toEqual({ marktplaats: false, vinted: false });
    expect(parsePlatforms("vintd")).toBeNull(); // typefout: alles negeren
    expect(parsePlatforms("vinted, ebay")).toBeNull();
  });

  describe("toepassen", () => {
    let userId: string;
    beforeEach(async () => {
      await resetDb();
      userId = (await makeUser()).user.id;
      await prisma.searchProfile.create({ data: { userId, name: APELDOORN_RADAR_NAME, active: true, query: "", sourceKind: "SEARCH", sourceConfig: { queries: ["iphone"] }, intervalMinutes: 5, notifyChannels: [] } });
      await prisma.appSettings.create({ data: { key: "provision:smart-radar-v2", value: {} } });
    });

    it("niet ingesteld: niets doen", async () => {
      expect(await applyPlatformEnv(userId, undefined)).toMatchObject({ applied: false, reason: "niet ingesteld" });
      expect((await radarOf(userId)).active).toBe(true);
      expect(await vintedOn()).toBe(false);
    });

    it("vinted: Marktplaats gepauzeerd, Vinted aan met een Vinted-profiel", async () => {
      const r = await applyPlatformEnv(userId, "vinted");
      expect(r).toMatchObject({ applied: true, platforms: { marktplaats: false, vinted: true } });
      expect((await radarOf(userId)).active).toBe(false);
      expect(await vintedOn()).toBe(true);
      const profiles = await prisma.searchProfile.findMany({ where: { userId } });
      const vinted = profiles.find((p) => (p.sourceConfig as { platform?: string }).platform === "vinted");
      expect(vinted).toMatchObject({ active: true });
      expect(profiles).toHaveLength(2); // geen extra profielen
    });

    it("één keer per wijziging: daarna kan de app het zelf bijsturen", async () => {
      await applyPlatformEnv(userId, "vinted");
      expect(await applyPlatformEnv(userId, "vinted")).toMatchObject({ applied: false, reason: "al toegepast" });
      await prisma.searchProfile.update({ where: { id: (await radarOf(userId)).id }, data: { active: true } }); // beheerder zet Marktplaats weer aan
      await applyPlatformEnv(userId, "vinted");
      expect((await radarOf(userId)).active).toBe(true); // niet teruggedraaid
      // nieuwe waarde: wél opnieuw toepassen
      expect(await applyPlatformEnv(userId, "marktplaats")).toMatchObject({ applied: true });
      expect((await radarOf(userId)).active).toBe(true);
      expect(await vintedOn()).toBe(false);
    });

    it("geen: alles uit; marktplaats,vinted: alles aan", async () => {
      await applyPlatformEnv(userId, "geen");
      expect((await radarOf(userId)).active).toBe(false);
      expect(await vintedOn()).toBe(false);
      await applyPlatformEnv(userId, "marktplaats,vinted");
      expect((await radarOf(userId)).active).toBe(true);
      expect(await vintedOn()).toBe(true);
    });

    it("een typefout verandert niets", async () => {
      expect(await applyPlatformEnv(userId, "vintd")).toMatchObject({ applied: false, reason: "onbekende waarde genegeerd" });
      expect((await radarOf(userId)).active).toBe(true);
      expect(await vintedOn()).toBe(false);
    });

    it("wacht tot het vaste profiel is ingericht", async () => {
      await prisma.appSettings.delete({ where: { key: "provision:smart-radar-v2" } });
      expect(await applyPlatformEnv(userId, "vinted")).toMatchObject({ applied: false, reason: "wacht op inrichting" });
      expect((await radarOf(userId)).active).toBe(true);
    });
  });
});
