import { HttpError } from "@/lib/auth";
import { routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { processJobs } from "@/lib/jobs/queue";
import { handlers, runProfileCheck } from "@/lib/jobs/handlers";
import { errMsg } from "@/lib/log";

/** "Nu controleren": voert de profielcontrole direct uit en verwerkt daarna de analyse-jobs. */
export const POST = routeP<{ id: string }>(async (_req, { params, user }) => {
  const p = await prisma.searchProfile.findUnique({ where: { id: params.id } });
  if (!p || p.userId !== user.id) throw new HttpError(404, "Zoekprofiel niet gevonden");
  try {
    const r = await runProfileCheck(p.id);
    const jobs = await processJobs(handlers, { maxJobs: 60, deadlineMs: 25_000, types: ["ANALYZE_AD", "NOTIFY"] });
    return { ok: true, ...r, analyzed: jobs.processed, failed: jobs.failed };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});
