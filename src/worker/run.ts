import "./env";
import { runRulesMaintenance } from "../lib/rules/maintenance";
import { scheduleDueProfiles, handlers } from "../lib/jobs/handlers";
import { processJobs } from "../lib/jobs/queue";
import { prisma } from "../lib/db/client";
import { pollMailbox } from "../lib/mail/poll";
import { installApeldoornRadar } from "../lib/radar/provision";
import { getConfig } from "../lib/settings/store";
import { jobLanes } from "../lib/jobs/lanes";
import { upgradeRadarPolling } from "../lib/radar/fast-polling";

const configuredInterval = Number(process.env.WORKER_INTERVAL_SECONDS ?? 3);
const idleMs =
  (Number.isFinite(configuredInterval)
    ? Math.min(30, Math.max(1, configuredInterval))
    : 3) * 1000;
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
  wake?.();
});
process.on("SIGINT", () => {
  stop = true;
  wake?.();
});

// Maakt de hoofdlus direct wakker (bijv. na een nieuwe advertentie uit de mailbox) in plaats van de wachttijd uit te zitten
let wake: (() => void) | null = null;
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    const t = setTimeout(() => {
      wake = null;
      r();
    }, ms);
    wake = () => {
      clearTimeout(t);
      wake = null;
      r();
    };
  });

/** Aparte lus voor de gekoppelde mailbox (Marktplaats-zoekalerts); draait los van het zoeken. */
async function mailLoop() {
  while (!stop) {
    let every = 20_000;
    try {
      const cfg = await getConfig();
      every = cfg.mail.pollSeconds * 1000;
      if (cfg.mail.enabled) {
        const r = await pollMailbox({ onNewAds: () => wake?.() });
        if (r.ingested || !r.ok)
          console.log(
            `[mail] mails=${r.mails} nieuw=${r.ingested}${r.error ? ` fout=${r.error}` : ""}`,
          );
      }
    } catch (e) {
      console.error("[mail] fout:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, every).unref());
  }
}

/** Inkoopregels-onderhoud: maandelijkse prijsaanpassing en M-nummers uit Telegram (elke 5 minuten). */
async function rulesLoop() {
  while (!stop) {
    await runRulesMaintenance();
    await new Promise((r) => setTimeout(r, 300_000).unref());
  }
}

async function main() {
  console.log(`[worker] gestart, wachttijd bij leegloop ${idleMs / 1000}s`);
  void mailLoop();
  void rulesLoop();
  // Standaardprofielen (iPhone-melder) automatisch aanmaken zodra er een beheerder is; controleert periodiek tot dat gelukt is
  const provision = async () => {
    try {
      const admin = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
      });
      if (!admin) return "wacht-op-beheerder" as const;
      const marker = await prisma.appSettings.findUnique({
        where: { key: "provision:smart-radar-v2" },
      });
      if (marker) return "al-gedaan" as const;
      await installApeldoornRadar(admin.id);
      await upgradeRadarPolling();
      await prisma.appSettings.create({
        data: {
          key: "provision:smart-radar-v2",
          value: { at: new Date().toISOString() },
        },
      });
      const r = "gedaan" as const;
      if (r === "gedaan")
        console.log(
          "[worker] Smart Inkoopradar aangemaakt en snelle modus aangezet",
        );
      return r;
    } catch (e) {
      console.error("[worker] provisioning mislukt:", (e as Error).message);
      return "fout" as const;
    }
  };
  void (async () => {
    while (!stop && (await provision()) !== "al-gedaan")
      await new Promise((r) => setTimeout(r, 30_000).unref());
  })();
  await upgradeRadarPolling();
  const lane = async (options: ReturnType<typeof jobLanes>[number]) => {
    while (!stop) {
      try {
        const r = await processJobs(handlers, {
          ...options,
          maxJobs: 100,
          deadlineMs: 5000,
        });
        if (r.processed) {
          console.log(`[worker:${options.name}] verwerkt=${r.processed} mislukt=${r.failed}`);
          continue;
        }
      } catch (e) {
        console.error("[worker] lane:", (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  const cfg = await getConfig();
  console.log(`[worker] detectie-interval=${cfg.scheduler.fast.intervalSeconds}s requestlimiet=${cfg.scheduler.fast.maxRequestsPerMinute}/min`);
  const lanes = jobLanes(cfg.scheduler.concurrency).map(lane);
  let heartbeatAt = 0;
  while (!stop) {
    try {
      // WORKER_SCRAPING=off: testomgeving verwerkt alleen wat er al is (geen extra verzoeken naar Marktplaats)
      const scheduled = process.env.WORKER_SCRAPING === "off" ? 0 : await scheduleDueProfiles();
      if (Date.now() - heartbeatAt >= 10_000) {
        await prisma.appSettings.upsert({
          where: { key: "worker:heartbeat" },
          create: {
            key: "worker:heartbeat",
            value: { at: new Date().toISOString() },
          },
          update: { value: { at: new Date().toISOString() } },
        });
        heartbeatAt = Date.now();
      }
      if (scheduled) console.log(`[worker] controles gepland=${scheduled}`);
    } catch (e) {
      console.error("[worker] fout:", (e as Error).message);
    }
    await sleep(cfg.scheduler.fast.enabled ? Math.min(idleMs, 1000) : idleMs);
  }
  await Promise.all(lanes);
  await prisma.$disconnect();
}
void main().catch(async (e) => {
  console.error("[worker] fataal:", (e as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
