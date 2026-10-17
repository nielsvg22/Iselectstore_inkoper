import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeUser } from "../helpers";
import { prisma } from "@/lib/db/client";
import {
  installApeldoornRadar,
  restoreRadarProfiles,
} from "@/lib/radar/provision";
import { ingestAd } from "@/lib/pipeline/ingest";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { matchProfiles } from "@/lib/pipeline/analyze";
import { defaultConfig } from "@/lib/config/schema";
import { type FilterContext } from "@/lib/engines/filters";

describe("herstelbare radar", () => {
  beforeEach(resetDb);
  it("archiveert regels en historie, herhaalt veilig en herstelt oorspronkelijke status", async () => {
    const { user } = await makeUser();
    const p = await prisma.searchProfile.create({
      data: {
        userId: user.id,
        name: "oud",
        sourceKind: "SEARCH",
        sourceConfig: { queries: ["iphone"] },
      },
    });
    await prisma.searchRule.create({
      data: { profileId: p.id, kind: "GROUP", op: "AND", position: 0 },
    });
    const r = await installApeldoornRadar(user.id);
    expect(r.backupKey).toBeTruthy();
    expect(await prisma.searchProfile.count({ where: { active: true } })).toBe(
      1,
    );
    expect(await prisma.searchRule.count({ where: { profileId: p.id } })).toBe(
      1,
    );
    expect((await installApeldoornRadar(user.id)).id).toBe(r.id);
    await restoreRadarProfiles(user.id, r.backupKey!);
    expect(
      (await prisma.searchProfile.findUniqueOrThrow({ where: { id: p.id } }))
        .active,
    ).toBe(true);
    expect(
      (await prisma.searchProfile.findUniqueOrThrow({ where: { id: r.id } }))
        .active,
    ).toBe(false);
  });
  it("maakt één push voor voorlopige en volledige beoordeling samen", async () => {
    const { user } = await makeUser();
    const { id } = await installApeldoornRadar(user.id);
    await prisma.searchProfile.update({
      where: { id },
      data: {
        sourceConfig: {
          fastMode: true,
          baselineAt: new Date(Date.now() - 60000).toISOString(),
        },
      },
    });
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: "https://push.example/radar",
        p256dh: "test",
        auth: "test",
      },
    });
    const r = await ingestAd(
      {
        externalId: "m123456789",
        title: "iPhone 16 Pro 256GB",
        description: "Apple telefoon",
        url: "https://www.marktplaats.nl/v/m123456789",
        imageUrls: [],
        askingCents: 42000,
      },
      { origin: "SEARCH", enqueueAnalysis: false },
    );
    await analyzeAd(r.adId, { quick: true });
    const ctx = {
      family: "iphone",
      blocked: false,
      score: 50,
    } as FilterContext;
    const cfg = structuredClone(defaultConfig);
    cfg.scheduler.fast.enabled = true;
    const meta = {
      band: "MODERATE" as const,
      score: 50,
      blocked: false,
      isDemo: false,
      userIgnored: false,
      netProfitCents: 0,
      firstSeenAt: new Date(),
      publishedAt: null,
      origin: "SEARCH",
      complete: false,
    };
    await matchProfiles(r.adId, ctx, meta, cfg);
    await matchProfiles(r.adId, ctx, { ...meta, complete: true }, cfg);
    expect(
      await prisma.notification.count({
        where: { adId: r.adId, channel: "WEBPUSH" },
      }),
    ).toBe(1);
  });
});

it("50 gelijktijdig gematchte advertenties krijgen elk exact één push-job", async () => {
  await resetDb();
  const { user } = await makeUser();
  const { id } = await installApeldoornRadar(user.id);
  await prisma.searchProfile.update({
    where: { id },
    data: {
      sourceConfig: {
        fastMode: true,
        baselineAt: new Date(Date.now() - 60000).toISOString(),
      },
    },
  });
  await prisma.pushSubscription.create({
    data: {
      userId: user.id,
      endpoint: "https://push.example/load",
      p256dh: "test",
      auth: "test",
    },
  });
  const ads = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      prisma.advertisement.create({
        data: {
          externalId: `load-${i}`,
          source: "test",
          origin: "SEARCH",
          title: `iPhone ${i}`,
          url: `https://www.marktplaats.nl/v/m999999${i}`,
          contentHash: `hash-${i}`,
          fingerprint: `fp-${i}`,
          shippingOptions: [],
        },
      }),
    ),
  );
  const cfg = structuredClone(defaultConfig);
  cfg.scheduler.fast.enabled = true;
  const ctx = { family: "iphone", blocked: false, score: 50 } as FilterContext;
  const meta = {
    band: "MODERATE" as const,
    score: 50,
    blocked: false,
    isDemo: false,
    userIgnored: false,
    netProfitCents: 0,
    firstSeenAt: new Date(),
    publishedAt: null,
    origin: "SEARCH",
    complete: false,
  };
  // Kleine batches simuleren gelijktijdige workers zonder de verbindingspool uit te putten.
  for (let i = 0; i < ads.length; i += 5)
    await Promise.all(
      ads.slice(i, i + 5).map((ad) => matchProfiles(ad.id, ctx, meta, cfg)),
    );
  expect(
    await prisma.notification.count({ where: { channel: "WEBPUSH" } }),
  ).toBe(50);
  expect(await prisma.backgroundJob.count({ where: { type: "NOTIFY" } })).toBe(
    50,
  );
});

it("reserveert bronrequests atomair over gelijktijdige processen", async () => {
  await resetDb();
  const { reserveMarktplaatsSlot } = await import("@/lib/sources/request-gate");
  const now = Date.now();
  const slots = (
    await Promise.all(
      Array.from({ length: 8 }, () => reserveMarktplaatsSlot(10000, now)),
    )
  ).sort((a, b) => a - b);
  expect(new Set(slots).size).toBe(8);
  expect(slots[0]).toBe(now);
  for (let i = 1; i < slots.length; i++)
    expect(slots[i] - slots[i - 1]).toBe(10000);
});

it("slaat de eerste pagina op voordat de volgende zoekterm is opgehaald", async () => {
  await resetDb();
  const { searchAdapter } = await import("@/lib/sources/marktplaats-search");
  const { readFileSync } = await import("node:fs");
  const events: string[] = [];
  await searchAdapter.fetchProfile({
    profileId: "test",
    query: "",
    config: { queries: ["iphone", "ipad"], maxPages: 1, fetchDetails: false },
    maxAds: 120,
    onAds: async () => {
      events.push("ingest");
    },
    lookup: async () => ["93.184.216.34"],
    fetchImpl: (async (url: string) => {
      if (url.endsWith("robots.txt")) return new Response("User-agent: *");
      events.push(url.includes("/ipad/") ? "ipad" : "iphone");
      return new Response(
        readFileSync("tests/fixtures/mp-search.html", "utf8"),
      );
    }) as typeof fetch,
  });
  expect(events.indexOf("ingest")).toBeLessThan(events.indexOf("ipad"));
});
