import { getConfig } from "../settings/store";
import { handlers, scheduleDueProfiles } from "./handlers";
import { processJobs } from "./queue";

/** Eén werkronde: plan fällige controles en verwerk een beperkt aantal jobs. */
export async function runTick(opts: { deadlineMs?: number } = {}) {
  const cfg = await getConfig();
  const scheduled = await scheduleDueProfiles();
  const deadlineMs = opts.deadlineMs ?? 50_000;
  // Twee rijen naast elkaar: (1) netwerk naar de bron — gepaceerd, dus één loper; (2) analyse/meldingen — parallel.
  // Zo houdt een trage AI-analyse nooit het ophalen of het versturen van een melding tegen.
  const [net, work] = await Promise.all([
    processJobs(handlers, { maxJobs: cfg.limits.jobsPerTick, deadlineMs, types: ["CHECK_PROFILE", "FETCH_DETAIL"], concurrency: 1 }),
    processJobs(handlers, { maxJobs: cfg.limits.jobsPerTick * 4, deadlineMs, types: ["ANALYZE_AD", "NOTIFY", "CLEANUP"], concurrency: cfg.scheduler.concurrency }),
  ]);
  return { scheduled, processed: net.processed + work.processed, failed: net.failed + work.failed };
}
