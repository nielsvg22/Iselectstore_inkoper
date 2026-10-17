import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { extractAdLinks } from "@/lib/mail/links";
import {
  getMailState,
  pollMailbox,
  processMail,
  testMailbox,
} from "@/lib/mail/poll";
import type { MailClient, MailMsg } from "@/lib/mail/imap";
import { processJobs } from "@/lib/jobs/queue";
import { handlers, scheduleDueProfiles } from "@/lib/jobs/handlers";
import { deliverNotification } from "@/lib/notify/dispatch";
import type { PushSender } from "@/lib/notify/push";
import { saveTree } from "@/lib/pipeline/tree";
import { ingestAd } from "@/lib/pipeline/ingest";
import { saveConfig, secretStatus, setSecret } from "@/lib/settings/store";
import { GET as settingsGet } from "@/app/api/settings/route";
import { POST as mailTestPost } from "@/app/api/mail/test/route";
import { ctx, makeUser, req, resetDb } from "../helpers";

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

const V1 =
  "https://www.marktplaats.nl/v/telecommunicatie/mobiele-telefoons-apple-iphone/m2460000001-iphone-15-pro-256gb";
const V2 =
  "https://www.marktplaats.nl/v/telecommunicatie/mobiele-telefoons-apple-iphone/m2460000002-iphone-14-128gb";

function eml(opts: {
  from?: string;
  subject?: string;
  html: string;
  date?: Date;
}) {
  return [
    `From: ${opts.from ?? "Marktplaats <noreply@marktplaats.nl>"}`,
    "To: ik@example.com",
    `Subject: ${opts.subject ?? "Nieuwe advertenties voor iPhone"}`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    opts.html,
  ].join("\r\n");
}

const detailHtml = (id: string, title: string, price: number) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: title, description: "Batterij 91%. iCloud vrij, simlockvrij. Mooi toestel, incl. oplader en doos. Ophalen mogelijk. ".repeat(2), sku: id, image: [1, 2, 3, 4].map((n) => `https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/${id}-${n}?rule=ecg_mp_eps$_86`), offers: { price: String(price), priceCurrency: "EUR" } })}</script></head></html>`;

function stubDetail(hits: string[] = []) {
  vi.stubGlobal("fetch", async (u: string) => {
    const url = new URL(u);
    if (url.pathname === "/robots.txt")
      return new Response("User-agent: *\nDisallow: /lrp/api/search*");
    hits.push(url.pathname);
    const m = /\/(m\d+)-/.exec(url.pathname);
    if (!m) return new Response("nee", { status: 404 });
    return new Response(
      detailHtml(
        m[1],
        m[1] === "m2460000001" ? "iPhone 15 Pro 256GB" : "iPhone 14 128GB",
        m[1] === "m2460000001" ? 300 : 280,
      ),
      { headers: { "content-type": "text/html" } },
    );
  });
}

const fakeClient = (state: {
  validity?: string;
  maxUid: number;
  msgs: MailMsg[];
  fail?: string;
}): MailClient => ({
  async fetchNew(lastUid) {
    if (state.fail) throw new Error(state.fail);
    return {
      uidValidity: state.validity ?? "1",
      maxUid: state.maxUid,
      messages:
        lastUid == null ? [] : state.msgs.filter((m) => m.uid > lastUid),
    };
  },
  async recent(n) {
    return state.msgs.slice(-n);
  },
});

beforeEach(async () => {
  await resetDb();
  vi.unstubAllGlobals();
  await saveConfig({
    limits: { minSecondsBetweenRequests: 0 },
    mail: { enabled: true, host: "imap.example.com", user: "ik@example.com" },
    notifications: { enabled: true },
  });
});

describe("links uit Marktplaats-mails", () => {
  it("herkent directe links, doorgestuurde/URL-gecodeerde links en ontdubbelt; negeert andere domeinen", () => {
    const html = `<a href="${V1}?utm_source=mail">één</a> <a href="https://click.marktplaats.nl/r?u=${encodeURIComponent(V2)}&amp;x=1">twee</a> <a href="${V1}">dubbel</a> <a href="https://evil.example/v/x/m2999999999-nep">nep</a> <a href="https://www.marktplaats.nl/u/profiel/1">profiel</a>`;
    const l = extractAdLinks(html, "");
    expect(l.map((x) => x.externalId).sort()).toEqual([
      "m2460000001",
      "m2460000002",
    ]);
    expect(
      l.every((x) => x.url.startsWith("https://www.marktplaats.nl/v/")),
    ).toBe(true);
    expect(extractAdLinks("", `Bekijk: ${V1}.`)[0].externalId).toBe(
      "m2460000001",
    );
  });
});

describe("mail verwerken", () => {
  it("haalt de advertenties uit de mail op, slaat ze op en zet de analyse klaar; onbekende afzender en dry-run doen niets", async () => {
    const hits: string[] = [];
    stubDetail(hits);
    const html = `<a href="${V1}">a</a><a href="${V2}">b</a>`;
    expect(
      (await processMail(eml({ from: "Iemand <spam@example.org>", html })))
        .matched,
    ).toBe(false);
    const dry = await processMail(eml({ html }), { dryRun: true });
    expect(dry).toMatchObject({ matched: true, links: 2, ingested: 0 });
    expect(await prisma.advertisement.count()).toBe(0);

    const r = await processMail(eml({ html }));
    expect(r).toMatchObject({ matched: true, links: 2, ingested: 2 });
    const ads = await prisma.advertisement.findMany({
      orderBy: { externalId: "asc" },
    });
    expect(
      ads.map((a) => [a.externalId, a.origin, a.detailFetchedAt != null]),
    ).toEqual([
      ["m2460000001", "MANUAL_URL", true],
      ["m2460000002", "MANUAL_URL", true],
    ]);
    expect(
      await prisma.backgroundJob.count({ where: { type: "ANALYZE_AD" } }),
    ).toBe(2);

    hits.length = 0;
    expect((await processMail(eml({ html }))).ingested).toBe(0); // al volledig bekend: geen tweede request
    expect(hits).toHaveLength(0);
  });
});

describe("mailbox pollen", () => {
  it("eerste poll legt alleen de stand vast (oude mails nooit verwerken); daarna worden nieuwe mails verwerkt en loopt de UID op", async () => {
    stubDetail();
    const old: MailMsg = {
      uid: 5,
      source: Buffer.from(eml({ html: `<a href="${V2}">x</a>` })),
    };
    const st = { maxUid: 5, msgs: [old] };
    const c = fakeClient(st);
    expect((await pollMailbox({ client: c })).ingested).toBe(0);
    expect((await getMailState()).lastUid).toBe(5);
    expect(await prisma.advertisement.count()).toBe(0);

    st.maxUid = 6;
    st.msgs.push({
      uid: 6,
      source: Buffer.from(eml({ html: `<a href="${V1}">x</a>` })),
    });
    const wake = vi.fn();
    const r = await pollMailbox({ client: c, onNewAds: wake });
    expect(r).toMatchObject({ ok: true, mails: 1, ingested: 1 });
    expect(wake).toHaveBeenCalledOnce(); // worker wordt direct wakker gemaakt
    const s = await getMailState();
    expect(s).toMatchObject({ lastUid: 6, mailsMatched: 1, adsIngested: 1 });
    expect(s.lastMail?.delaySec).toBeLessThan(30);
    // dezelfde mail wordt niet opnieuw verwerkt
    expect((await pollMailbox({ client: c })).mails).toBe(0);
  });

  it("UIDVALIDITY gewijzigd: opnieuw alleen de stand opnemen; fouten worden bewaard zonder uit te vallen; uitgeschakeld = niets", async () => {
    const st: {
      validity?: string;
      maxUid: number;
      msgs: MailMsg[];
      fail?: string;
    } = { validity: "1", maxUid: 3, msgs: [] };
    const c = fakeClient(st);
    await pollMailbox({ client: c });
    st.validity = "2";
    st.maxUid = 40;
    st.msgs.push({
      uid: 39,
      source: Buffer.from(eml({ html: `<a href="${V1}">x</a>` })),
    });
    expect((await pollMailbox({ client: c })).mails).toBe(0);
    expect(await getMailState()).toMatchObject({
      uidValidity: "2",
      lastUid: 40,
    });
    expect(await prisma.advertisement.count()).toBe(0);

    st.fail = "Invalid credentials";
    const bad = await pollMailbox({ client: c });
    expect(bad).toMatchObject({ ok: false });
    expect((await getMailState()).lastError).toContain("Invalid credentials");

    await saveConfig({ mail: { enabled: false } });
    expect(
      (
        await pollMailbox({
          client: fakeClient({ maxUid: 1, msgs: [], fail: "mag niet" }),
        })
      ).skipped,
    ).toBe("uit");
  });

  it("test verbinding toont alleen Marktplaats-mails met het aantal herkende links", async () => {
    const msgs: MailMsg[] = [
      {
        uid: 1,
        source: Buffer.from(
          eml({ from: "Bank <x@bank.nl>", html: "<p>hoi</p>" }),
        ),
      },
      {
        uid: 2,
        source: Buffer.from(
          eml({
            subject: "iPhone alert",
            html: `<a href="${V1}">x</a><a href="${V2}">y</a>`,
          }),
        ),
      },
    ];
    const t = await testMailbox(fakeClient({ maxUid: 2, msgs }));
    expect(t.folderMails).toBe(2);
    expect(t.matching).toEqual([
      expect.objectContaining({ subject: "iPhone alert", links: 2 }),
    ]);
  });
});

describe("hele keten: Marktplaats-alert in de mailbox → push", () => {
  const okSender =
    (calls: Array<{ payload: string }>): PushSender =>
    async (_s, payload) => {
      calls.push({ payload });
      return { statusCode: 201 };
    };

  it("profiel 'alleen via mailbox': wordt niet zelf gezocht, krijgt wél een definitieve push voor een alert-advertentie, maar niet voor advertenties uit het zoeken", async () => {
    const { user } = await makeUser();
    const p = await prisma.searchProfile.create({
      data: {
        userId: user.id,
        name: "Mail iPhone",
        sourceKind: "SEARCH",
        notifyMinScore: 0,
        notifyChannels: [],
        sourceConfig: { queries: ["iphone"], mailOnly: true },
      },
    });
    await saveTree(p.id, {
      op: "AND",
      children: [{ field: "family", operator: "in", value: ["iphone"] }],
    });
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: "https://push.example/m",
        p256dh: "p".repeat(30),
        auth: "a".repeat(12),
      },
    });
    await prisma.marketComparable.createMany({
      data: [700, 690, 710, 705, 695, 715, 702, 698].map((x, i) => ({
        modelKey: "iphone-15-pro",
        storageGb: 256,
        priceCents: x * 100,
        kind: i < 2 ? ("REALIZED" as const) : ("ASKING_CURRENT" as const),
        observedAt: new Date(Date.now() - i * 86400000),
      })),
    });
    expect(await scheduleDueProfiles()).toBe(0); // niet zelf zoeken

    // een advertentie die via zoeken van een ander profiel is binnengekomen mag dit profiel niet laten pushen
    await ingestAd(
      {
        externalId: "m2460000099",
        url: "https://www.marktplaats.nl/v/x/m2460000099-a",
        title: "iPhone 15 Pro 256GB zoek",
        description:
          "Batterij 90%. iCloud vrij. Mooi toestel zonder krassen, incl. oplader en doos.",
        askingCents: 30000,
        location: "Utrecht",
        distanceKm: 10,
        imageUrls: [
          "https://i.example/a1.jpg",
          "https://i.example/a2.jpg",
          "https://i.example/a3.jpg",
        ],
        shipping: ["pickup"],
        publishedAt: new Date(),
        detailLoaded: true,
      },
      { origin: "SEARCH", partial: true },
    );

    stubDetail();
    const st = { maxUid: 1, msgs: [] as MailMsg[] };
    const c = fakeClient(st);
    await pollMailbox({ client: c }); // nulmeting
    st.maxUid = 2;
    st.msgs.push({
      uid: 2,
      source: Buffer.from(eml({ html: `<a href="${V1}">iPhone 15 Pro</a>` })),
    });
    expect((await pollMailbox({ client: c })).ingested).toBe(1);
    await processJobs(handlers, {
      maxJobs: 50,
      types: ["ANALYZE_AD"],
      concurrency: 2,
    });

    const notes = await prisma.notification.findMany({
      where: { channel: "WEBPUSH" },
      include: { ad: true },
    });
    expect(notes.map((n) => n.ad.externalId)).toEqual(["m2460000001"]); // alleen de mail-advertentie
    const calls: Array<{ payload: string }> = [];
    await deliverNotification(notes[0].id, undefined, {
      push: okSender(calls),
    });
    const pl = JSON.parse(calls[0].payload);
    expect(pl.url).toBe(`/ads/${notes[0].adId}`);
    expect(pl.body).toMatch(/€.*afstand onbekend\nGeschatte winst/);
    expect(pl.body).not.toMatch(/volledige advertentie/); // de volledige advertentie is al opgehaald, dus dat is geen voorbehoud meer
  });
});

describe("mailbox-instellingen en beveiliging", () => {
  it("wachtwoord komt nooit terug uit de API; test vereist beheerder en lekt geen geheimen", async () => {
    const { cookie } = await makeUser();
    await setSecret("imap.password", "supergeheim-app-wachtwoord");
    const j = await (
      await settingsGet(req("/api/settings", { cookie }))
    ).text();
    expect(j).not.toContain("supergeheim");
    expect(
      (await secretStatus()).find((s) => s.key === "imap.password")?.isSet,
    ).toBe(true);
    const user = await makeUser("USER", "gewoon@example.com");
    expect(
      (
        await mailTestPost(
          req("/api/mail/test", {
            method: "POST",
            cookie: user.cookie,
            body: {},
          }),
        )
      ).status,
    ).toBe(403);
    // zonder host: nette fout zonder wachtwoord
    await saveConfig({ mail: { host: "" } });
    const r = await mailTestPost(
      req("/api/mail/test", { method: "POST", cookie, body: {} }),
    );
    expect(r.status).toBe(400);
    expect(await r.text()).not.toContain("supergeheim");
  });
});
