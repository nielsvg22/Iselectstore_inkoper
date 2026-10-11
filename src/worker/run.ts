import "./env";
import { runTick } from "../lib/jobs/tick";
import { prisma } from "../lib/db/client";

const idleMs = Number(process.env.WORKER_INTERVAL_SECONDS ?? 5) * 1000;
let stop = false;
process.on("SIGTERM", () => (stop = true));
process.on("SIGINT", () => (stop = true));

async function main() {
  console.log(`[worker] gestart, wachttijd bij leegloop ${idleMs / 1000}s`);
  while (!stop) {
    try {
      const r = await runTick({ deadlineMs: 30_000 });
      if (r.scheduled || r.processed) console.log(`[worker] gepland=${r.scheduled} verwerkt=${r.processed} mislukt=${r.failed}`);
      // Er was werk: direct door (lage latentie). Anders even wachten.
      if (r.processed > 0) continue;
    } catch (e) {
      console.error("[worker] fout:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, idleMs));
  }
  await prisma.$disconnect();
}
void main();
