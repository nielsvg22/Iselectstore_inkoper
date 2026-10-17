import "./env";
import { scheduleDueProfiles, handlers } from "../lib/jobs/handlers";
import { processJobs } from "../lib/jobs/queue";
import { prisma } from "../lib/db/client";
import { pollMailbox } from "../lib/mail/poll";
import { installApeldoornRadar } from "../lib/radar/provision";
import { getConfig } from "../lib/settings/store";

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

async function main() {
  console.log(`[worker] gestart, wachttijd bij leegloop ${idleMs / 1000}s`);
  void mailLoop();
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
      await prisma.appSettings.create({
        data: {
          key: "provision:smart-radar-v2",
          value: { at: new Date().toISOString() },
        },
      });
      const r = "gedaan" as const;
      if (r === "gedaan")
        console.log(
          "[worker] iPhone-melder automatisch aangemaakt en snelle modus aangezet",
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
  const lane = async (
    types: Parameters<typeof processJobs>[1]["types"],
    concurrency: number,
  ) => {
    while (!stop) {
      try {
        const r = await processJobs(handlers, {
          types,
          concurrency,
          maxJobs: 100,
          deadlineMs: 5000,
        });
        if (r.processed) continue;
      } catch (e) {
        console.error("[worker] lane:", (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  const cfg = await getConfig();
  const lanes = [
    lane(["CHECK_PROFILE", "FETCH_DETAIL"], 1),
    lane(["ANALYZE_AD", "CLEANUP"], cfg.scheduler.concurrency),
    lane(["NOTIFY"], 1),
  ];
  while (!stop) {
    try {
      const scheduled = await scheduleDueProfiles();
      await prisma.appSettings.upsert({
        where: { key: "worker:heartbeat" },
        create: {
          key: "worker:heartbeat",
          value: { at: new Date().toISOString() },
        },
        update: { value: { at: new Date().toISOString() } },
      });
      const r = { scheduled, processed: 0, failed: 0 };
      if (r.scheduled || r.processed)
        console.log(
          `[worker] gepland=${r.scheduled} verwerkt=${r.processed} mislukt=${r.failed}`,
        );
      // Er was werk: direct door (lage latentie). Anders even wachten.
      if (r.processed > 0) continue;
    } catch (e) {
      console.error("[worker] fout:", (e as Error).message);
    }
    await sleep(idleMs);
  }
  await Promise.all(lanes);
  await prisma.$disconnect();
}
void main().catch(async (e) => {
  console.error("[worker] fataal:", (e as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
