/**
 * Snelheidsmeting van de verwerkingsketen (alles na het ophalen):
 *   ingest → voorselectie → volledige analyse → profielmatch → melding aangemaakt → push "verzonden".
 * De push-dienst wordt nagebootst (geen netwerk), dus "verzonden" = ons deel van de keten.
 * Daarnaast meet het script (optioneel, met --live) één echte zoekpagina van Marktplaats via curl (fetch + parse).
 *
 *   DATABASE_URL=postgresql://…/dealhunter_test APP_SECRET=… npx tsx scripts/benchmark.ts [--live] [--ads 300]
 */
import { execFileSync } from "node:child_process";
import { prisma } from "../src/lib/db/client";
import { handlers } from "../src/lib/jobs/handlers";
import { processJobs } from "../src/lib/jobs/queue";
import { deliverNotification } from "../src/lib/notify/dispatch";
import { getPerformance } from "../src/lib/metrics";
import { ingestAd } from "../src/lib/pipeline/ingest";
import { saveTree } from "../src/lib/pipeline/tree";
import { generateDemoAds, generateDemoComparables } from "../src/lib/sources/demo-data";
import { buildSearchUrl, parseSearchPage } from "../src/lib/sources/marktplaats-search";
import { saveConfig } from "../src/lib/settings/store";
import { hashPassword } from "../src/lib/security/crypto";

const N = Number(process.argv[process.argv.indexOf("--ads") + 1]) || 300;
const live = process.argv.includes("--live");
const fmt = (s: number | null) => (s == null ? "—" : `${s.toFixed(2)} s`);

async function main() {
  if (!/_test|bench/.test(process.env.DATABASE_URL ?? "")) throw new Error("Gebruik een testdatabase (naam bevat _test of bench): dit script leegt tabellen.");
  await prisma.$executeRawUnsafe(`TRUNCATE "User","SearchProfile","Advertisement","MarketComparable","ValuationHistory","AppSettings","BackgroundJob","SourceHealth","AiUsage","AiCache","AuditLog","Purchase","CheckRun","PushSubscription" RESTART IDENTITY CASCADE`);
  await saveConfig({ notifications: { enabled: true, requireFullAnalysis: true } });
  const user = await prisma.user.create({ data: { email: "bench@example.com", passwordHash: hashPassword("benchmark-wachtwoord") } });
  await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/bench", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
  const profiles = [
    { name: "iPhone 15/16 Pro ≤ €700", tree: { op: "AND", children: [{ field: "family", operator: "in", value: ["iphone"] }, { field: "askingEuro", operator: "lte", value: 700 }, { field: "expectedProfitEuro", operator: "gte", value: 60 }] } },
    { name: "MacBook ≤ €900", tree: { op: "AND", children: [{ field: "family", operator: "in", value: ["macbook_air", "macbook_pro"] }, { field: "askingEuro", operator: "lte", value: 900 }] } },
    { name: "AirPods", tree: { op: "AND", children: [{ field: "family", operator: "in", value: ["airpods"] }] } },
    { name: "iPad ≥ 128GB", tree: { op: "AND", children: [{ field: "family", operator: "in", value: ["ipad"] }, { field: "storageGb", operator: "gte", value: 128 }] } },
    { name: "Alles dichtbij of ver mét verzending", tree: { op: "AND", children: [{ op: "OR", children: [{ op: "AND", children: [{ field: "distanceKm", operator: "lte_if_known", value: 45 }] }, { op: "AND", children: [{ field: "distanceKm", operator: "gt", value: 45 }, { field: "shippingAvailable", operator: "isTrue" }, { field: "expectedProfitEuro", operator: "gte", value: 150 }] }] }] } },
  ];
  for (const p of profiles) {
    const row = await prisma.searchProfile.create({ data: { userId: user.id, name: p.name, sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: [], sourceConfig: { queries: ["x"] } } });
    await saveTree(row.id, p.tree);
  }
  const comps = generateDemoComparables();
  await prisma.marketComparable.createMany({ data: comps.map((c) => ({ ...(c as object), isDemo: false })) as never });

  const ads = generateDemoAds(N, 99).map((a, i) => ({ ...a, externalId: `bench${i}`, title: `${a.title} #${i}`, imageUrls: [`https://img.example/${i}-1.jpg`, `https://img.example/${i}-2.jpg`, `https://img.example/${i}-3.jpg`], askingCents: a.askingCents ? a.askingCents + (i % 17) * 500 : a.askingCents, location: `Plaats ${i % 60}`, url: `https://www.marktplaats.nl/v/x/bench${i}-a`, detailLoaded: true, seller: { id: String(i % 40), name: i % 3 ? "Anoniem" : "Verkoper", verified: i % 5 === 0, business: i % 11 === 0, anonymous: i % 3 !== 0 } }));
  const t0 = Date.now();
  // Eerste detectie: advertenties komen in golven binnen, zoals bij opeenvolgende zoekrondes
  for (const a of ads) await ingestAd(a, { origin: "SEARCH", partial: true });
  const ingestMs = Date.now() - t0;
  // NOTIFY met nagebootste pushdienst; alle jobtypes lopen door elkaar, zoals in de worker (analyse + meldingen parallel)
  const send = async () => ({ statusCode: 201 });
  const benchHandlers = { ...handlers, NOTIFY: async (job: { payload: unknown }) => deliverNotification((job.payload as { notificationId: string }).notificationId, undefined, { push: send }) };
  await processJobs(benchHandlers as never, { maxJobs: 100000, deadlineMs: 600_000, types: ["ANALYZE_AD", "FETCH_DETAIL", "NOTIFY"], concurrency: 3 });
  const totalMs = Date.now() - t0;
  const analyzeMs = totalMs;
  const notes = await prisma.notification.findMany({ where: { channel: "WEBPUSH", status: "SENT" }, select: { id: true } });
  const perf = await getPerformance(1);
  console.log(`\nBenchmark: ${N} advertenties, ${profiles.length} zoekprofielen, 3 parallelle analyses`);
  console.log(`  ingest (alle ${N}): ${(ingestMs / 1000).toFixed(1)} s  ·  + analyse en meldingen: ${(totalMs / 1000).toFixed(1)} s`);
  console.log(`  meldingen aangemaakt/verzonden: ${notes.length}`);
  console.table(Object.entries(perf.latency).map(([k, d]) => ({ stap: k, n: d.n, gemiddeld: fmt(d.avg), p50: fmt(d.p50), p95: fmt(d.p95), max: fmt(d.max) })));
  console.log("  Let op: dit zijn allemaal advertenties die tegelijk binnenkomen (zware piek); in de praktijk komen er per controle enkele nieuwe advertenties binnen.");

  if (live) {
    console.log("\nEchte Marktplaats-zoekpagina's (één voorbeeld, via curl; netwerk + parsen):");
    for (const q of ["iphone 16 pro max", "macbook air m2", "airpods pro 2"]) {
      const url = buildSearchUrl(q, undefined, 1);
      const s = Date.now();
      const html = execFileSync("curl", ["-s", "-A", "Mozilla/5.0 (compatible; AppleDealHunter/1.0)", url], { maxBuffer: 20e6 }).toString();
      const fetched = Date.now() - s;
      const p0 = Date.now();
      const page = parseSearchPage(html);
      console.log(`  ${q.padEnd(20)} ophalen ${fetched} ms · parsen ${Date.now() - p0} ms · ${page.ads.length} advertenties (${page.total ?? "?"} totaal)`);
      await new Promise((r) => setTimeout(r, 3000)); // 3 s pacing, zoals in de applicatie
    }
  }
  await prisma.$disconnect();
}
void main();
