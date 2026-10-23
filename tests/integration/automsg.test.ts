import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveRules, defaultRules } from "@/lib/rules/config";
import { firstName, prepareAutoMessage, recentAutoMessages, renderTemplate } from "@/lib/rules/automsg";
import { resetDb } from "../helpers";

const ad = (id: string, o: Partial<{ sellerId: string | null; sellerName: string | null; isDemo: boolean }> = {}) => ({ id, title: "iPhone 15 Pro", url: `https://www.marktplaats.nl/v/${id}`, sellerId: "26607609", sellerName: "jan de vries", isDemo: false, ...o });
const on = async (o: Record<string, unknown> = {}) => saveRules({ ...defaultRules(), autoMessage: { ...defaultRules().autoMessage, enabled: true, sellerIds: ["26607609"], requireMatch: false, notifyTelegram: false, ...o } });

beforeEach(async () => { await resetDb(); });

describe("auto-berichten klaarzetten", () => {
  it("vult de voornaam in en laat de aanhef netjes zonder naam", () => {
    expect(firstName("jan de vries")).toBe("Jan");
    expect(firstName("Marktplaats123")).toBe("");
    expect(firstName(null)).toBe("");
    expect(renderTemplate("Een goede dag {naam}, wat", "Jan")).toBe("Een goede dag Jan, wat");
    expect(renderTemplate("Een goede dag {naam}, wat", "")).toBe("Een goede dag, wat");
  });
  it("doet niets als het uit staat, voor andere verkopers, of bij demo-advertenties", async () => {
    expect((await prepareAutoMessage(ad("a1"), "match")).prepared).toBe(false);
    await on();
    expect((await prepareAutoMessage(ad("a2", { sellerId: "99" }), "match")).prepared).toBe(false);
    expect((await prepareAutoMessage(ad("a3", { sellerId: null }), "match")).prepared).toBe(false);
    expect((await prepareAutoMessage(ad("a4", { isDemo: true }), "match")).prepared).toBe(false);
    expect(await recentAutoMessages()).toHaveLength(0);
  });
  it("zet één bericht per advertentie klaar en wisselt de sjablonen af", async () => {
    await on();
    const r1 = await prepareAutoMessage(ad("b1"), null);
    expect(r1.prepared).toBe(true);
    expect(r1.text).toContain("Een goede dag Jan,");
    expect((await prepareAutoMessage(ad("b1"), null)).prepared).toBe(false);
    const r2 = await prepareAutoMessage(ad("b2"), null);
    expect(r2.text).not.toBe(r1.text);
    const log = await recentAutoMessages();
    expect(log).toHaveLength(2);
    expect(log.every((m) => m.sent === false)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "automsg.prepared" } })).toBe(2);
  });
  it("met 'alleen bij goedkeuring' wacht het op een voldoend oordeel van de regels", async () => {
    await on({ requireMatch: true });
    expect((await prepareAutoMessage(ad("c1"), "reject")).prepared).toBe(false);
    expect((await prepareAutoMessage(ad("c1"), null)).prepared).toBe(false);
    expect((await prepareAutoMessage(ad("c1"), "high")).prepared).toBe(true);
  });
});
