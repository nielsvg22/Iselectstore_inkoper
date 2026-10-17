import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET } from "@/app/api/jobs/status/route";
import { ingestAd } from "@/lib/pipeline/ingest";
import { req, makeUser, resetDb } from "../helpers";

beforeEach(resetDb);
const headers = { authorization: "Bearer test-cron-secret-1234567890" };
const status = (id?: string) => GET(req(`/api/jobs/status${id ? `?externalId=${encodeURIComponent(id)}` : ""}`, { headers }));
async function ad(externalId = "m1234567890") {
  return ingestAd({ externalId, title: "iPhone 16 Pro 256GB", url: `https://www.marktplaats.nl/v/x/${externalId}-iphone`, imageUrls: [] },
    { origin: "SEARCH", enqueueAnalysis: false });
}

describe("afgeschermde operationele advertentie- en pushtrace", () => {
  it("weigert ontbrekende/verkeerde bearer en een te kort of ontbrekend servergeheim", async () => {
    expect((await GET(req("/api/jobs/status"))).status).toBe(401);
    expect((await GET(req("/api/jobs/status", { headers: { authorization: "Bearer verkeerd" } }))).status).toBe(401);
    try {
      vi.stubEnv("CRON_SECRET", "short"); expect((await status()).status).toBe(401);
      vi.stubEnv("CRON_SECRET", ""); expect((await status()).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
  it("valideert advertentienummers en meldt niet gevonden expliciet", async () => {
    expect((await status("m123';DROP TABLE")).status).toBe(400);
    const r = await status("m1234567890"); const d = await r.json();
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toContain("no-store");
    expect(d.lookup).toEqual({ externalId: "m1234567890", found: false }); expect(d.ads).toEqual([]);
  });
  it("onderscheidt pushacceptatie van uitsluitend een in-app-melding, zonder apparaatsleutels te lekken", async () => {
    const { user } = await makeUser(); const a = await ad();
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/private-device-token", auth: "device-auth-secret", p256dh: "device-key-secret", lastSuccessAt: new Date() } });
    await prisma.notification.create({ data: { adId: a.adId, userId: user.id, channel: "INAPP", status: "SENT", sentAt: new Date(), dedupeKey: "inapp-test" } });
    let d = await (await status("m1234567890")).json();
    expect(d.ads[0].stage).not.toBe("push_accepted");
    await prisma.notification.create({ data: { adId: a.adId, userId: user.id, channel: "WEBPUSH", status: "SENT", sentAt: new Date(), dedupeKey: "push-test" } });
    d = await (await status("m1234567890")).json();
    expect(d.ads[0].stage).toBe("push_accepted"); expect(d.latestNotifications[0].ad.externalId).toBe("m1234567890");
    for (const secret of ["private-device-token", "device-auth-secret", "device-key-secret", user.email]) expect(JSON.stringify(d)).not.toContain(secret);
  });
  it("toont wachtrij en mislukking afzonderlijk en redigeert endpointadressen in fouten", async () => {
    const a = await ad();
    const n = await prisma.notification.create({ data: { adId: a.adId, channel: "WEBPUSH", status: "PENDING", dedupeKey: "pending-test", error: "Fetch failed https://push.example/private-token" } });
    let d = await (await status("m1234567890")).json(); expect(d.ads[0].stage).toBe("push_queued"); expect(JSON.stringify(d)).not.toContain("private-token");
    await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED" } });
    d = await (await status("m1234567890")).json(); expect(d.ads[0].stage).toBe("push_failed");
  });
  it("onderscheidt uitsluiten en overslaan en haalt alleen het gevraagde aanbod op", async () => {
    const a = await ad(); await ad("m1234567891");
    await prisma.advertisement.update({ where: { id: a.adId }, data: { userState: "IGNORED" } });
    let d = await (await status("m1234567890")).json(); expect(d.ads).toHaveLength(1); expect(d.ads[0].stage).toBe("excluded");
    await prisma.notification.create({ data: { adId: a.adId, channel: "WEBPUSH", status: "SKIPPED", dedupeKey: "skip-test", error: "Geen actief pushapparaat" } });
    d = await (await status("m1234567890")).json(); expect(d.ads[0].stage).toBe("push_skipped"); expect(d.ads[0].notifications[0].error).toBe("Geen actief pushapparaat");
  });
});
