import "./env";
import { runTick } from "../lib/jobs/tick";
import { prisma } from "../lib/db/client";

const everyMs = Number(process.env.WORKER_INTERVAL_SECONDS ?? 20) * 1000;
let stop = false;
process.on("SIGTERM", () => (stop = true));
process.on("SIGINT", () => (stop = true));

async function main() {
  console.log(`[worker] gestart, interval ${everyMs / 1000}s`);
  while (!stop) {
    try {
      const r = await runTick({ deadlineMs: Math.max(5000, everyMs - 2000) });
      if (r.scheduled || r.processed) console.log(`[worker] gepland=${r.scheduled} verwerkt=${r.processed} mislukt=${r.failed}`);
    } catch (e) {
      console.error("[worker] fout:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  await prisma.$disconnect();
}
void main();
