import "./env";
import { runTick } from "../lib/jobs/tick";
import { prisma } from "../lib/db/client";
import { pollMailbox } from "../lib/mail/poll";
import { ensureDefaultProfiles } from "../lib/provision";
import { getConfig } from "../lib/settings/store";

const idleMs = Number(process.env.WORKER_INTERVAL_SECONDS ?? 3) * 1000;
let stop = false;
process.on("SIGTERM", () => (stop = true));
process.on("SIGINT", () => (stop = true));

// Maakt de hoofdlus direct wakker (bijv. na een nieuwe advertentie uit de mailbox) in plaats van de wachttijd uit te zitten
let wake: (() => void) | null = null;
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    const t = setTimeout(() => { wake = null; r(); }, ms);
    wake = () => { clearTimeout(t); wake = null; r(); };
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
        if (r.ingested || !r.ok) console.log(`[mail] mails=${r.mails} nieuw=${r.ingested}${r.error ? ` fout=${r.error}` : ""}`);
      }
    } catch (e) {
      console.error("[mail] fout:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, every));
  }
}

async function main() {
  console.log(`[worker] gestart, wachttijd bij leegloop ${idleMs / 1000}s`);
  void mailLoop();
  // Standaardprofielen (iPhone-melder) automatisch aanmaken zodra er een beheerder is; controleert periodiek tot dat gelukt is
  const provision = async () => {
    try {
      const r = await ensureDefaultProfiles();
      if (r === "gedaan") console.log("[worker] iPhone-melder automatisch aangemaakt en snelle modus aangezet");
      return r;
    } catch (e) {
      console.error("[worker] provisioning mislukt:", (e as Error).message);
      return "fout" as const;
    }
  };
  void (async () => {
    while (!stop && (await provision()) !== "al-gedaan" ) await new Promise((r) => setTimeout(r, 30_000));
  })();
  while (!stop) {
    try {
      const r = await runTick({ deadlineMs: 30_000 });
      if (r.scheduled || r.processed) console.log(`[worker] gepland=${r.scheduled} verwerkt=${r.processed} mislukt=${r.failed}`);
      // Er was werk: direct door (lage latentie). Anders even wachten.
      if (r.processed > 0) continue;
    } catch (e) {
      console.error("[worker] fout:", (e as Error).message);
    }
    await sleep(idleMs);
  }
  await prisma.$disconnect();
}
void main();
