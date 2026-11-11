import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { defaultRules, getRules, TWAN_PRESET_VERSION } from "@/lib/rules/config";

describe("Twan-voorinstelling bij het laden van de regels", () => {
  beforeEach(async () => { await prisma.appSettings.deleteMany({ where: { key: "rules:bbp" } }); });

  it("zonder opgeslagen configuratie: meteen Twans waarden, opgeslagen met versie", async () => {
    const c = await getRules();
    expect(c).toMatchObject({ marginTable: "TWAN", presetVersion: TWAN_PRESET_VERSION });
    expect(c.battery.table).toBe("twan");
    const row = await prisma.appSettings.findUnique({ where: { key: "rules:bbp" } });
    expect((row!.value as { presetVersion: number }).presetVersion).toBe(TWAN_PRESET_VERSION);
  });

  it("een oude opgeslagen configuratie wordt één keer omgezet", async () => {
    const old = { ...defaultRules(), marginTable: "A", priceBase: "buy85", presetVersion: 0, battery: { ...defaultRules().battery, table: "standard" } };
    await prisma.appSettings.create({ data: { key: "rules:bbp", value: old as object } });
    const c = await getRules();
    expect(c.marginTable).toBe("TWAN");
    expect(c.priceBase).toBe("sell");
    expect(c.battery.table).toBe("twan");
  });

  it("daarna blijft een eigen keuze staan (niet steeds opnieuw overschreven)", async () => {
    await getRules();
    const row = await prisma.appSettings.findUnique({ where: { key: "rules:bbp" } });
    const edited = { ...(row!.value as object), marginTable: "A" };
    await prisma.appSettings.update({ where: { key: "rules:bbp" }, data: { value: edited as object } });
    expect((await getRules()).marginTable).toBe("A");
  });
});
