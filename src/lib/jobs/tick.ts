import { getConfig } from "../settings/store";
import { handlers, scheduleDueProfiles } from "./handlers";
import { processJobs } from "./queue";
import { jobLanes } from "./lanes";

/** Eén werkronde: plan fällige controles en verwerk een beperkt aantal jobs. */
export async function runTick(opts: { deadlineMs?: number } = {}) {
  const cfg = await getConfig();
  const scheduled = await scheduleDueProfiles();
  const deadlineMs = opts.deadlineMs ?? 50_000;
  const started = Date.now();
  const rounds = await Promise.all(jobLanes(cfg.scheduler.concurrency).map((lane) =>
    processJobs(handlers, { ...lane, maxJobs: cfg.limits.jobsPerTick, deadlineMs }),
  ));
  // De snelle loper kan leeg zijn geweest vóór het eerste zoekresultaat binnenkwam.
  // Verwerk die nieuwe analyses én hun meldingen nog in deze ronde.
  if (Date.now() - started < deadlineMs) {
    rounds.push(await processJobs(handlers, { maxJobs: cfg.limits.jobsPerTick * 4,
      types: ["ANALYZE_AD"], analysisMode: "quick",
      deadlineMs: deadlineMs - (Date.now() - started), concurrency: cfg.scheduler.concurrency }));
    rounds.push(await processJobs(handlers, { maxJobs: cfg.limits.jobsPerTick * 4,
      types: ["NOTIFY"], deadlineMs: Math.max(1, deadlineMs - (Date.now() - started)) }));
  }
  return { scheduled, processed: rounds.reduce((n, r) => n + r.processed, 0), failed: rounds.reduce((n, r) => n + r.failed, 0) };
}
