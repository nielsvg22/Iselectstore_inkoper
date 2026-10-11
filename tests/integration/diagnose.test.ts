import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { diagnose } from "@/lib/diagnose";
import { setCooldown } from "@/lib/jobs/cooldown";
import { setPrefs } from "@/lib/notify/prefs";
import { saveConfig } from "@/lib/settings/store";
import { makeUser, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
});

const by = (cs: Awaited<ReturnType<typeof diagnose>>, id: string) => cs.find((c) => c.id === id)!;

describe("diagnose: waarom geen melding?", () => {
  it("zonder apparaat is dat het eerste probleem, met uitleg wat te doen", async () => {
    const { user } = await makeUser();
    const c = await diagnose(user.id);
    expect(by(c, "device")).toMatchObject({ status: "error" });
    expect(by(c, "device").action).toMatch(/Pushmeldingen inschakelen/);
    expect(by(c, "scraper").status).toBe("error"); // nog geen controle gedraaid
  });

  it("signaleert te strenge voorkeuren, uitgeschakelde snelle modus, blokkade, onafgeronde nulmeting en mislukte meldingen", async () => {
    const { user } = await makeUser();
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/d", p256dh: "p".repeat(30), auth: "a".repeat(12), lastSuccessAt: new Date() } });
    const p = await prisma.searchProfile.create({ data: { userId: user.id, name: "iPhone 15", sourceKind: "SEARCH", notifyChannels: [], sourceConfig: { queries: ["iphone 15"], fastMode: true } } });
    await prisma.checkRun.create({ data: { profileId: p.id, ok: true, startedAt: new Date(), finishedAt: new Date(), pages: 3 } });
    await prisma.searchProfile.update({ where: { id: p.id }, data: { lastSuccessAt: new Date() } });
    let c = await diagnose(user.id);
    expect(by(c, "device").status).toBe("ok");
    expect(by(c, "prefs").status).toBe("ok");
    expect(by(c, "fast").status).toBe("warn");
    expect(by(c, "baseline").detail).toMatch(/1 profielen hebben die eerste controle nog niet afgerond/);
    expect(by(c, "scraper").status).toBe("ok");

    await setPrefs(user.id, { mode: "top", minProfitEuro: 100 });
    await saveConfig({ scheduler: { fast: { enabled: true } } });
    await setCooldown("marktplaats-search", "HTTP 429");
    const ad = await prisma.advertisement.create({ data: { origin: "SEARCH", externalId: "m1", url: "https://www.marktplaats.nl/v/x/m1-a", title: "iPhone", fingerprint: "f" } });
    await prisma.notification.create({ data: { adId: ad.id, userId: user.id, channel: "WEBPUSH", dedupeKey: "k1", status: "SKIPPED", error: "Geen actief pushapparaat" } });
    await prisma.notification.create({ data: { adId: ad.id, userId: user.id, channel: "WEBPUSH", dedupeKey: "k2", status: "FAILED", error: "Push mislukt: 500" } });
    c = await diagnose(user.id);
    expect(by(c, "prefs")).toMatchObject({ status: "warn" });
    expect(by(c, "prefs").action).toMatch(/Alle passende deals/);
    expect(by(c, "fast").status).toBe("ok");
    expect(by(c, "cooldown").status).toBe("error");
    expect(by(c, "notifications")).toMatchObject({ status: "error" });
    expect(by(c, "notifications").detail).toMatch(/1 overgeslagen, 1 mislukt/);
  });
});
