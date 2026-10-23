import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { ingestAd } from "@/lib/pipeline/ingest";
import { saveTree } from "@/lib/pipeline/tree";
import { deliverNotification, sendTestPush } from "@/lib/notify/dispatch";
import { processJobs } from "@/lib/jobs/queue";
import { handlers, runDetailFetch } from "@/lib/jobs/handlers";
import { saveConfig } from "@/lib/settings/store";
import { setPrefs } from "@/lib/notify/prefs";
import { getVapid, type PushSender } from "@/lib/notify/push";
import { getPerformance } from "@/lib/metrics";
import { ctx, makeUser, req, resetDb } from "../helpers";
import type { RawAd } from "@/lib/sources/types";
import { GET as vapidGet } from "@/app/api/push/vapid/route";
import { POST as subscribePost } from "@/app/api/push/subscribe/route";
import { POST as testPost } from "@/app/api/push/test/route";
import { GET as devicesGet } from "@/app/api/push/devices/route";
import { DELETE as deviceDelete } from "@/app/api/push/devices/[id]/route";
import { PUT as prefsPut, GET as prefsGet } from "@/app/api/notify/prefs/route";
import { POST as filterTest } from "@/app/api/filters/test/route";

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

const raw = (o: Partial<RawAd> = {}): RawAd => ({
  externalId: "m2000001",
  url: "https://www.marktplaats.nl/v/x/m2000001-iphone",
  title: "iPhone 15 Pro 256GB",
  description:
    "Batterij 91%. iCloud vrij, simlockvrij. Mooi toestel zonder krassen, incl. oplader en doos. Ophalen mogelijk.",
  askingCents: 30000,
  location: "Utrecht",
  distanceKm: 34,
  imageUrls: [
    "https://img.example/1.jpg",
    "https://img.example/2.jpg",
    "https://img.example/3.jpg",
    "https://img.example/4.jpg",
  ],
  shipping: ["pickup", "shipping"],
  publishedAt: new Date(),
  seller: {
    id: "5",
    name: "Piet",
    verified: true,
    business: false,
    anonymous: false,
  },
  ...o,
});

async function seedComps() {
  await prisma.marketComparable.createMany({
    data: [700, 690, 710, 705, 695, 715, 702, 698].map((p, i) => ({
      modelKey: "iphone-15-pro",
      storageGb: 256,
      priceCents: p * 100,
      kind: i < 2 ? ("REALIZED" as const) : ("ASKING_CURRENT" as const),
      observedAt: new Date(Date.now() - i * 86400000),
    })),
  });
}
async function drain() {
  // NOTIFY bewust niet: die versturen we in de tests zelf met een nagebootste pushdienst
  await processJobs(handlers, {
    maxJobs: 100,
    concurrency: 2,
    types: ["ANALYZE_AD", "FETCH_DETAIL"],
  });
}
const okSender =
  (calls: Array<{ endpoint: string; payload: string }> = []): PushSender =>
  async (sub, payload) => {
    calls.push({ endpoint: sub.endpoint, payload });
    return { statusCode: 201 };
  };

async function setup(opts: { push?: boolean; profiles?: number } = {}) {
  const { user, cookie } = await makeUser();
  await saveConfig({
    limits: { minSecondsBetweenRequests: 0 },
    notifications: { enabled: true },
  });
  const profiles = [];
  for (let i = 0; i < (opts.profiles ?? 1); i++) {
    const p = await prisma.searchProfile.create({
      data: {
        userId: user.id,
        name: `P${i}`,
        sourceKind: "SEARCH",
        notifyMinScore: 0,
        notifyChannels: ["TELEGRAM"],
        sourceConfig: {
          queries: ["iphone"],
          baselineAt: new Date(Date.now() - 3600_000).toISOString(),
        },
      },
    });
    await saveTree(p.id, { op: "AND", children: [] });
    profiles.push(p);
  }
  if (opts.push !== false)
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: "https://push.example/abc",
        p256dh: "p".repeat(30),
        auth: "a".repeat(12),
        label: "iPhone",
      },
    });
  await seedComps();
  return { user, cookie, profiles };
}

beforeEach(async () => {
  await resetDb();
  vi.unstubAllGlobals();
});

describe("Web Push API", () => {
  it("vereist inloggen en lekt nooit de private VAPID-sleutel", async () => {
    expect((await vapidGet(req("/api/push/vapid"))).status).toBe(401);
    const { cookie } = await makeUser();
    const r = await vapidGet(req("/api/push/vapid", { cookie }));
    const text = await r.text();
    const v = await getVapid();
    expect(text).toContain(v.publicKey);
    expect(text).not.toContain(v.privateKey);
    // sleutel is stabiel (eenmalig gegenereerd) en staat versleuteld in de database
    expect((await getVapid()).publicKey).toBe(v.publicKey);
    const row = await prisma.appSettings.findUniqueOrThrow({
      where: { key: "secret:push.vapid" },
    });
    expect(JSON.stringify(row.value)).not.toContain(v.privateKey);
  });

  it("registreert apparaten per gebruiker (idempotent op endpoint), alleen https, en beheert ze", async () => {
    const { cookie } = await makeUser();
    const body = {
      endpoint: "https://push.example/xyz",
      keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
    };
    expect(
      (
        await subscribePost(
          req("/api/push/subscribe", {
            method: "POST",
            cookie,
            body: { ...body, endpoint: "http://insecure.example/x" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await subscribePost(
          req("/api/push/subscribe", { method: "POST", cookie, body }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await subscribePost(
          req("/api/push/subscribe", { method: "POST", cookie, body }),
        )
      ).status,
    ).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(1);
    const list = (await (
      await devicesGet(req("/api/push/devices", { cookie }))
    ).json()) as { devices: Array<{ id: string; endpoint?: string }> };
    expect(list.devices).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("push.example"); // endpoint/sleutels worden niet teruggegeven
    // een andere gebruiker kan het apparaat niet verwijderen
    const other = await makeUser("USER", "other@example.com");
    expect(
      (
        await deviceDelete(
          req("/x", { method: "DELETE", cookie: other.cookie }),
          ctx({ id: list.devices[0].id }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await deviceDelete(
          req("/x", { method: "DELETE", cookie }),
          ctx({ id: list.devices[0].id }),
        )
      ).status,
    ).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("testpush bereikt alle ingeschakelde apparaten; zonder apparaat een duidelijke fout; verlopen abonnement wordt opgeruimd", async () => {
    const { user } = await setup({ push: false });
    await expect(sendTestPush(user.id, okSender())).rejects.toThrow(
      /Geen pushapparaat/,
    );
    await prisma.pushSubscription.createMany({
      data: [
        {
          userId: user.id,
          endpoint: "https://push.example/1",
          p256dh: "p".repeat(30),
          auth: "a".repeat(12),
        },
        {
          userId: user.id,
          endpoint: "https://push.example/2",
          p256dh: "p".repeat(30),
          auth: "a".repeat(12),
        },
        {
          userId: user.id,
          endpoint: "https://push.example/off",
          p256dh: "p".repeat(30),
          auth: "a".repeat(12),
          enabled: false,
        },
      ],
    });
    const calls: Array<{ endpoint: string; payload: string }> = [];
    const gone: PushSender = async (sub, payload) => {
      if (sub.endpoint.endsWith("/2"))
        throw Object.assign(new Error("Gone"), { statusCode: 410 });
      calls.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    };
    expect(await sendTestPush(user.id, gone)).toEqual({
      sent: 1,
      failed: 0,
      removed: 1,
    });
    expect(calls.map((c) => c.endpoint)).toEqual(["https://push.example/1"]);
    expect(
      await prisma.pushSubscription.count({
        where: { endpoint: "https://push.example/2" },
      }),
    ).toBe(0);
    expect(JSON.parse(calls[0].payload)).toMatchObject({
      isTest: true,
      url: "/notifications",
    });
  });

  it("voorkeuren: valideren, opslaan, per gebruiker", async () => {
    const { cookie } = await makeUser();
    expect(
      (
        await prefsPut(
          req("/api/notify/prefs", {
            method: "PUT",
            cookie,
            body: { quiet: { enabled: true, start: "25:00", end: "07:00" } },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await prefsPut(
          req("/api/notify/prefs", {
            method: "PUT",
            cookie,
            body: { mode: "top", minProfitEuro: 120, minScore: 80 },
          }),
        )
      ).status,
    ).toBe(200);
    const g = (await (
      await prefsGet(req("/api/notify/prefs", { cookie }))
    ).json()) as { prefs: { mode: string; minProfitEuro: number } };
    expect(g.prefs).toMatchObject({ mode: "top", minProfitEuro: 120 });
  });
});

describe("snelle detectieketen: eerst opnemen, volledig beoordelen, dan pas melden", () => {
  it("geen (definitieve) melding zolang de detailpagina ontbreekt; daarna precies één push, ook bij meerdere matchende profielen en herhaalde analyse", async () => {
    const { user } = await setup({ profiles: 2 });
    const a = await ingestAd(raw({ detailLoaded: false }), {
      origin: "SEARCH",
      partial: true,
    });
    await drain(); // ANALYZE_AD (lijstfase)
    expect(await prisma.notification.count()).toBe(0); // wacht op detailpagina
    const ad0 = await prisma.advertisement.findUniqueOrThrow({
      where: { id: a.adId },
    });
    expect(ad0.prefilteredAt).toBeTruthy();
    expect(ad0.analyzedAt).toBeNull(); // volledige analyse volgt; voorlopige beoordeling is wel beschikbaar

    // detail-fase: volledige tekst
    vi.stubGlobal("fetch", async (u: string) => {
      const url = new URL(u);
      if (url.pathname === "/robots.txt")
        return new Response("User-agent: *\nDisallow: /lrp/api/search*");
      return new Response(
        `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "iPhone 15 Pro 256GB", description: "Volledig: batterij 91%, icloud vrij, simlockvrij, ophalen of verzenden. ".repeat(3), sku: "m2000001", image: ["https://img.example/1.jpg", "https://img.example/5.jpg"], offers: { price: "300", priceCurrency: "EUR" } })}</script></head></html>`,
        { headers: { "content-type": "text/html" } },
      );
    });
    await runDetailFetch(a.adId);
    await drain();
    const notes = await prisma.notification.findMany({
      where: { channel: "WEBPUSH" },
    });
    expect(notes).toHaveLength(1); // twee profielen, één push per gebruiker per advertentie
    expect(notes[0].userId).toBe(user.id);

    await analyzeAd(a.adId); // her-analyse: geen tweede melding
    await drain();
    expect(
      await prisma.notification.count({ where: { channel: "WEBPUSH" } }),
    ).toBe(1);

    const calls: Array<{ endpoint: string; payload: string }> = [];
    await deliverNotification(notes[0].id, undefined, {
      push: okSender(calls),
    });
    const n = await prisma.notification.findUniqueOrThrow({
      where: { id: notes[0].id },
    });
    expect(n.status).toBe("SENT");
    expect(n.sentAt).toBeTruthy();
    const payload = JSON.parse(calls[0].payload);
    expect(payload.url).toBe(`/ads/${a.adId}`); // klik opent de deal in het portaal
    expect(payload.body).toMatch(
      /€.*Utrecht · 34 km\nGeschatte winst .*Score \d+/,
    );
    expect(payload.externalUrl).toContain("marktplaats.nl");
    // opnieuw afleveren is idempotent
    await deliverNotification(notes[0].id, undefined, {
      push: okSender(calls),
    });
    expect(calls).toHaveLength(1);
  });

  it("detail definitief mislukt (verkocht/verwijderd): voorlopige melding, nooit als definitieve topdeal", async () => {
    await setup();
    const a = await ingestAd(raw({ detailLoaded: false }), {
      origin: "SEARCH",
      partial: true,
    });
    vi.stubGlobal("fetch", async (u: string) =>
      new URL(u).pathname === "/robots.txt"
        ? new Response("User-agent: *")
        : new Response("verwijderd", { status: 404 }),
    );
    await runDetailFetch(a.adId); // 404: niet herstelbaar => markeren en voorlopig beoordelen
    expect(
      (
        (
          await prisma.advertisement.findUniqueOrThrow({
            where: { id: a.adId },
          })
        ).rawPayload as { detailFailed?: boolean }
      ).detailFailed,
    ).toBe(true);
    await drain();
    const n = await prisma.notification.findFirstOrThrow({
      where: { channel: "WEBPUSH", adId: a.adId },
    });
    const calls: Array<{ endpoint: string; payload: string }> = [];
    await deliverNotification(n.id, undefined, { push: okSender(calls) });
    const p = JSON.parse(calls[0].payload);
    expect(p.provisional).toBe(true);
    expect(p.title).toMatch(/^Voorlopig/);
    expect(p.body).toMatch(
      /Controleer: .*volledige advertentie niet opgehaald/,
    );
  });

  it("push-retries: tijdelijke fout (503) blijft PENDING en wordt opnieuw geprobeerd; permanente fout (410) ruimt op", async () => {
    const { user } = await setup();
    const a = await ingestAd(raw({ detailLoaded: true }), {
      origin: "SEARCH",
      partial: true,
    });
    await drain();
    const n = await prisma.notification.findFirstOrThrow({
      where: { channel: "WEBPUSH", adId: a.adId },
    });
    const failing: PushSender = async () => {
      throw Object.assign(new Error("Service Unavailable"), {
        statusCode: 503,
      });
    };
    await expect(
      deliverNotification(n.id, undefined, { push: failing }),
    ).rejects.toThrow();
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } }))
        .status,
    ).toBe("PENDING");
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } }))
        .attempts,
    ).toBe(1);
    const calls: Array<{ endpoint: string; payload: string }> = [];
    await deliverNotification(n.id, undefined, { push: okSender(calls) });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } }))
        .status,
    ).toBe("SENT");
    expect(
      (
        await prisma.pushSubscription.findFirstOrThrow({
          where: { userId: user.id },
        })
      ).failures,
    ).toBe(0);
  });

  it("stilteperiode stelt de melding uit in plaats van te verwijderen; voorkeuren filteren (alleen topdeals)", async () => {
    const { user } = await setup();
    await setPrefs(user.id, { mode: "top", quiet: { enabled: false } });
    const a = await ingestAd(
      raw({
        detailLoaded: true,
        askingCents: 60000,
        externalId: "m2000002",
        url: "https://www.marktplaats.nl/v/x/m2000002-a",
      }),
      { origin: "SEARCH", partial: true },
    );
    await drain();
    const ad = await prisma.dealAnalysis.findFirstOrThrow({
      where: { adId: a.adId, isCurrent: true },
    });
    expect(ad.band).not.toBe("TOP");
    expect(
      await prisma.notification.count({
        where: { channel: "WEBPUSH", adId: a.adId },
      }),
    ).toBe(0);

    await setPrefs(user.id, {
      mode: "all",
      quiet: { enabled: true, start: "00:00", end: "23:59" },
    });
    const b = await ingestAd(
      raw({
        detailLoaded: true,
        externalId: "m2000003",
        url: "https://www.marktplaats.nl/v/x/m2000003-a",
        title: "iPhone 15 Pro 256GB Blauw",
        location: "Zwolle",
        imageUrls: [
          "https://img.example/b1.jpg",
          "https://img.example/b2.jpg",
          "https://img.example/b3.jpg",
        ],
      }),
      { origin: "SEARCH", partial: true },
    );
    await processJobs(handlers, { maxJobs: 50, types: ["ANALYZE_AD"] });
    const note = await prisma.notification.findFirstOrThrow({
      where: { adId: b.adId, channel: "WEBPUSH" },
    });
    const job = await prisma.backgroundJob.findFirstOrThrow({
      where: { uniqueKey: `notify:${note.id}` },
    });
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000); // uitgesteld tot einde stilteperiode
  });

  it("Telegram blijft werken en kan als alternatief worden ingesteld (alleen zonder pushapparaat)", async () => {
    const { user } = await setup();
    await setPrefs(user.id, { telegram: "fallback" });
    const a = await ingestAd(raw({ detailLoaded: true }), {
      origin: "SEARCH",
      partial: true,
    });
    await drain();
    expect(
      await prisma.notification.count({
        where: { adId: a.adId, channel: "TELEGRAM" },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { adId: a.adId, channel: "WEBPUSH" },
      }),
    ).toBe(1);
    // zonder pushapparaat: Telegram wel
    await prisma.pushSubscription.deleteMany();
    await prisma.notification.deleteMany();
    await saveConfig({ notifications: { minBand: "INTERESTING" } });
    await analyzeAd(a.adId);
    const tg = await prisma.notification.count({
      where: { adId: a.adId, channel: "TELEGRAM" },
    });
    const band = (
      await prisma.dealAnalysis.findFirstOrThrow({
        where: { adId: a.adId, isCurrent: true },
      })
    ).band;
    if (["TOP", "VERY_INTERESTING", "INTERESTING"].includes(band))
      expect(tg).toBe(1);
  });
});

describe("meting en filtertest", () => {
  it("berekent verwerkingstijden en percentielen uit echte tijdstempels", async () => {
    await setup();
    const a = await ingestAd(raw({ detailLoaded: true }), {
      origin: "SEARCH",
      partial: true,
    });
    await drain();
    const n = await prisma.notification.findFirstOrThrow({
      where: { adId: a.adId, channel: "WEBPUSH" },
    });
    await deliverNotification(n.id, undefined, { push: okSender() });
    const perf = await getPerformance(7);
    expect(perf.latency.fullAnalysis.n).toBe(1);
    expect(perf.latency.endToEnd.n).toBe(1);
    expect(perf.latency.endToEnd.p95).toBeGreaterThanOrEqual(0);
    expect(perf.notifications7d.sent).toBe(1);
    expect(perf.newAds24h).toBe(1);
  });

  it("filtertest legt per voorwaarde uit waarom een advertentie wel/niet voldoet (incl. OF-regel verder dan 45 km)", async () => {
    const { cookie } = await setup();
    await ingestAd(
      raw({
        detailLoaded: true,
        distanceKm: 120,
        shipping: ["shipping"],
        location: "Maastricht",
      }),
      { origin: "SEARCH", partial: true },
    );
    await ingestAd(
      raw({
        detailLoaded: true,
        externalId: "m2000009",
        url: "https://www.marktplaats.nl/v/x/m2000009-a",
        title: "iPhone 15 Pro 256GB Blauw",
        location: "Groningen",
        imageUrls: [
          "https://img.example/z1.jpg",
          "https://img.example/z2.jpg",
          "https://img.example/z3.jpg",
        ],
        distanceKm: 120,
        shipping: ["pickup"],
      }),
      { origin: "SEARCH", partial: true },
    );
    await drain();
    const tree = {
      op: "AND",
      children: [
        { field: "batteryHealth", operator: "gte", value: 85 },
        {
          op: "OR",
          children: [
            {
              op: "AND",
              children: [{ field: "distanceKm", operator: "lte", value: 45 }],
            },
            {
              op: "AND",
              children: [
                { field: "distanceKm", operator: "gt", value: 45 },
                { field: "shippingAvailable", operator: "isTrue" },
                { field: "expectedProfitEuro", operator: "gte", value: 100 },
              ],
            },
          ],
        },
      ],
    };
    const r = await filterTest(
      req("/api/filters/test", { method: "POST", cookie, body: { tree } }),
    );
    expect(r.status).toBe(200);
    const j = (await r.json()) as {
      total: number;
      matched: number;
      items: Array<{ pass: boolean; reasons: string[] }>;
      blockers: Array<{ label: string }>;
    };
    expect(j.total).toBe(2);
    expect(j.matched).toBe(1); // alleen de advertentie mét verzending
    const failed = j.items.find((i) => !i.pass)!;
    expect(failed.reasons.join(" ")).toMatch(/Verzending mogelijk/);
    expect(failed.reasons.join(" ")).toMatch(/nu: nee/);
    expect(j.blockers.length).toBeGreaterThan(0);
  });
});

describe("push naar meerdere apparaten (Chrome en iPhone)", () => {
  it("elk apparaat krijgt de melding; een mislukt apparaat blokkeert de rest niet en toont zijn fout; Topic niet voor Chrome/FCM", async () => {
    const { user, cookie } = await setup({ push: false });
    await prisma.pushSubscription.createMany({ data: [
      { userId: user.id, endpoint: "https://web.push.apple.com/iphone", p256dh: "p".repeat(30), auth: "a".repeat(12), label: "iPhone" },
      { userId: user.id, endpoint: "https://fcm.googleapis.com/fcm/send/chrome", p256dh: "p".repeat(30), auth: "a".repeat(12), label: "Mac" },
    ] });
    const seen: Array<{ endpoint: string; topic?: string }> = [];
    const sender: PushSender = async (sub, _payload, opts) => {
      seen.push({ endpoint: sub.endpoint, topic: (opts as { topic?: string } | undefined)?.topic });
      if (sub.endpoint.includes("fcm")) throw Object.assign(new Error("403 UnauthorizedRegistration"), { statusCode: 403 });
      return { statusCode: 201 };
    };
    const { sendPushToUser } = await import("@/lib/notify/push");
    const r = await sendPushToUser(user.id, { title: "t", body: "b", url: "/ads/x", tag: "ad-abc123" }, sender);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(seen.find((s) => s.endpoint.includes("apple"))?.topic).toBe("ad-abc123");
    expect(seen.find((s) => s.endpoint.includes("fcm"))?.topic).toBeUndefined();
    const list = (await (await devicesGet(req("/api/push/devices", { cookie }))).json()) as { devices: Array<{ label: string; lastError: string | null; endpointId: string }> };
    expect(list.devices.find((d) => d.label === "Mac")?.lastError).toMatch(/UnauthorizedRegistration/);
    expect(list.devices.every((d) => /^[0-9a-f]{16}$/.test(d.endpointId))).toBe(true);
    expect(JSON.stringify(list)).not.toContain("googleapis");
  });
});

describe("terugmelding van de browser (getoond of niet)", () => {
  it("de browser meldt getoond of een fout; alleen voor eigen apparaten", async () => {
    const { user, cookie } = await setup({ push: false });
    const other = await makeUser("USER", "ander@example.com");
    await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://fcm.googleapis.com/fcm/send/win", p256dh: "p".repeat(30), auth: "a".repeat(12), label: "Windows-pc" } });
    const { createHash } = await import("node:crypto");
    const endpointId = createHash("sha256").update("https://fcm.googleapis.com/fcm/send/win").digest("hex").slice(0, 16);
    const { POST: ackPost } = await import("@/app/api/push/ack/route");
    const post = (body: unknown, c: string) => ackPost(req("/api/push/ack", { method: "POST", body, cookie: c }));
    expect(((await (await post({ endpointId, ok: true }, cookie)).json()) as { ok: boolean }).ok).toBe(true);
    let row = await prisma.pushSubscription.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.lastShownAt).toBeTruthy();
    expect(row.lastShowError).toBeNull();
    await post({ endpointId, ok: false, error: "No notification permission has been granted for this origin" }, cookie);
    row = await prisma.pushSubscription.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.lastShowError).toMatch(/permission/);
    // een andere gebruiker raakt dit apparaat niet; ongeldige invoer wordt geweigerd; zonder sessie geen toegang
    expect(((await (await post({ endpointId, ok: true }, other.cookie)).json()) as { ok: boolean }).ok).toBe(false);
    expect((await post({ endpointId: "zomaar", ok: true }, cookie)).status).toBe(400);
    expect((await ackPost(req("/api/push/ack", { method: "POST", body: { endpointId, ok: true } }))).status).toBe(401);
    const list = (await (await devicesGet(req("/api/push/devices", { cookie }))).json()) as { devices: Array<{ lastShowError: string | null }> };
    expect(list.devices[0].lastShowError).toMatch(/permission/);
  });
});
