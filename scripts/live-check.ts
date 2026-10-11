/**
 * Proef met ECHTE Marktplaats-data (via curl, want Node heeft in deze sandbox geen DNS):
 * 1) eerste controle van een zoekprofiel in snelle modus → advertenties bekend
 * 2) twee advertenties worden "vergeten" = alsof ze net geplaatst zijn
 * 3) tweede controle → detectie → analyse → voorlopige push (nagebootste pushdienst)
 * Meet de tijd van detectie tot push. Gebruikt een testdatabase.
 */
import { execFileSync } from "node:child_process";
import { prisma } from "../src/lib/db/client";
import { handlers } from "../src/lib/jobs/handlers";
import { processJobs } from "../src/lib/jobs/queue";
import { deliverNotification } from "../src/lib/notify/dispatch";
import { ingestAd } from "../src/lib/pipeline/ingest";
import { saveTree } from "../src/lib/pipeline/tree";
import { generateDemoComparables } from "../src/lib/sources/demo-data";
import { searchAdapter } from "../src/lib/sources/marktplaats-search";
import { saveConfig } from "../src/lib/settings/store";
import { hashPassword } from "../src/lib/security/crypto";
import { buildPushPayload } from "../src/lib/notify/message";

const QUERY = process.argv[2] ?? "iphone 16 pro";
const curlFetch = (async (u: string) => {
  const out = execFileSync("curl", ["-s", "-A", "Mozilla/5.0 (compatible; AppleDealHunter/1.0)", "-w", "\n__STATUS__%{http_code}", u], { maxBuffer: 30e6 }).toString();
  const i = out.lastIndexOf("\n__STATUS__");
  return new Response(out.slice(0, i), { status: Number(out.slice(i + 11)), headers: { "content-type": "text/html" } });
}) as unknown as typeof fetch;
const lookup = async () => ["93.184.216.34"];

async function main() {
  if (!/_test|bench/.test(process.env.DATABASE_URL ?? "")) throw new Error("Gebruik een testdatabase");
  await prisma.$executeRawUnsafe(`TRUNCATE "User","SearchProfile","Advertisement","MarketComparable","ValuationHistory","AppSettings","BackgroundJob","SourceHealth","AiUsage","AiCache","AuditLog","Purchase","CheckRun","PushSubscription" RESTART IDENTITY CASCADE`);
  await saveConfig({ limits: { minSecondsBetweenRequests: 0 }, scheduler: { fast: { enabled: true } }, notifications: { enabled: true } });
  const user = await prisma.user.create({ data: { email: "live@example.com", passwordHash: hashPassword("live-wachtwoord-123") } });
  await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/live", p256dh: "p".repeat(30), auth: "a".repeat(12) } });
  await prisma.marketComparable.createMany({ data: generateDemoComparables().map((c) => ({ ...(c as object), isDemo: false })) as never });
  const profile = await prisma.searchProfile.create({ data: { userId: user.id, name: "Live test", sourceKind: "SEARCH", notifyMinScore: 0, notifyChannels: [], sourceConfig: { queries: [QUERY], fastMode: true, maxPages: 2 } } });
  await saveTree(profile.id, { op: "AND", children: [] });

  const check = async (label: string) => {
    const t = Date.now();
    const ads = await searchAdapter.fetchProfile({ profileId: profile.id, query: "", config: { queries: [QUERY], maxPages: 2 }, maxAds: 120, deferDetails: true, fast: { pages: 2 }, cacheSeconds: 0, fetchImpl: curlFetch, lookup });
    const fetchMs = Date.now() - t;
    let created = 0;
    for (const a of ads) if ((await ingestAd(a, { origin: "SEARCH", partial: true })).created) created++;
    console.log(`${label}: ${ads.length} advertenties opgehaald in ${fetchMs} ms, ${created} nieuw`);
    return { t, created };
  };

  await check("Controle 1 (alles is nieuw voor de database)");
  await processJobs(handlers, { maxJobs: 1000, types: ["ANALYZE_AD"], concurrency: 3 });
  // alle meldingen van controle 1 weggooien: we willen alleen de "net geplaatste" zien
  await prisma.backgroundJob.deleteMany({ where: { type: "NOTIFY" } });
  await prisma.notification.deleteMany();
  const known = await prisma.advertisement.findMany({ orderBy: { firstSeenAt: "desc" }, take: 2, select: { id: true, title: true, externalId: true } });
  await prisma.advertisement.deleteMany({ where: { id: { in: known.map((k) => k.id) } } });
  console.log(`→ Simuleer net geplaatst: ${known.map((k) => `"${k.title}"`).join(" en ")}\n`);

  const { t } = await check("Controle 2 (60 s later)");
  const calls: Array<{ at: number; payload: ReturnType<typeof buildPushPayload> }> = [];
  const sender = async (_s: unknown, payload: string) => { calls.push({ at: Date.now() - t, payload: JSON.parse(payload) }); return { statusCode: 201 }; };
  const live = { ...handlers, NOTIFY: async (job: { payload: unknown }) => deliverNotification((job.payload as { notificationId: string }).notificationId, undefined, { push: sender as never }) };
  await processJobs(live as never, { maxJobs: 100, types: ["ANALYZE_AD", "NOTIFY"], concurrency: 3 });
  console.log(`Detail-jobs klaargezet: ${await prisma.backgroundJob.count({ where: { type: "FETCH_DETAIL", status: "PENDING" } })} (lopen apart, blokkeren de detectie niet)`);
  if (!calls.length) console.log("Geen push verstuurd — kijk naar filters/score/duplicaten.");
  for (const c of calls) console.log(`PUSH na ${c.at} ms (vanaf start controle 2): ${c.payload.title} | ${c.payload.body.replace(/\n/g, " | ")} | provisional=${c.payload.provisional}`);
  await prisma.$disconnect();
}
void main();
