import { getConfig } from "../settings/store";
import { handlers, scheduleDueProfiles } from "./handlers";
import { processJobs } from "./queue";

/** Eén werkronde: plan fällige controles en verwerk een beperkt aantal jobs. */
export async function runTick(opts: { deadlineMs?: number } = {}) {
  const cfg = await getConfig();
  const scheduled = await scheduleDueProfiles();
  const res = await processJobs(handlers, { maxJobs: cfg.limits.jobsPerTick, deadlineMs: opts.deadlineMs ?? 50_000 });
  return { scheduled, ...res };
}
