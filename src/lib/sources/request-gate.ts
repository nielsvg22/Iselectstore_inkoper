import { prisma } from "../db/client";
import { getConfig } from "../settings/store";
import { getCooldown } from "../jobs/cooldown";
import { SourceError } from "./types";

/** Eén gedeelde pacing voor web, cron en worker, inclusief details. Geen lokale proceslimiet. */
export async function waitForMarktplaatsSlot(priority: "discovery" | "background" = "discovery") {
  const cooldown = await getCooldown("marktplaats-search");
  if (cooldown)
    throw new SourceError(
      `Bron gepauzeerd tot ${cooldown.until.toISOString()}`,
      false,
    );
  const cfg = await getConfig();
  const gap = Math.max(
    3000,
    cfg.limits.minSecondsBetweenRequests * 1000,
    60000 / cfg.scheduler.fast.maxRequestsPerMinute,
  );
  // Reserveer alleen het huidige vrije slot, nooit toekomstige slots voor een detailachterstand.
  // Zo kan een nieuwe zoekcontrole voorrang krijgen zonder de gezamenlijke limiet te verhogen.
  for (;;) {
    if (await getCooldown("marktplaats-search"))
      throw new SourceError("Bron inmiddels gepauzeerd", false);
    if (await tryMarktplaatsSlot(gap, priority)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function tryMarktplaatsSlot(gap: number, priority: "discovery" | "background", now = Date.now()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('marktplaats-request-gate'))`;
    const row = await tx.appSettings.findUnique({ where: { key: "source:marktplaats:next-request" } });
    if (Number((row?.value as { at?: number } | null)?.at ?? 0) > now) return false;
    if (priority === "background" && await tx.backgroundJob.findFirst({
      where: { type: "CHECK_PROFILE", OR: [{ status: "RUNNING" }, { status: "PENDING", runAt: { lte: new Date(now) } }] },
      select: { id: true },
    })) return false;
    await tx.appSettings.upsert({
      where: { key: "source:marktplaats:next-request" },
      create: { key: "source:marktplaats:next-request", value: { at: now + gap } },
      update: { value: { at: now + gap } },
    });
    return true;
  });
}

export async function reserveMarktplaatsSlot(gap: number, now = Date.now()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('marktplaats-request-gate'))`;
    const row = await tx.appSettings.findUnique({
      where: { key: "source:marktplaats:next-request" },
    });
    const next = Number((row?.value as { at?: number } | null)?.at ?? 0);
    const at = Math.max(now, next);
    await tx.appSettings.upsert({
      where: { key: "source:marktplaats:next-request" },
      create: {
        key: "source:marktplaats:next-request",
        value: { at: at + gap },
      },
      update: { value: { at: at + gap } },
    });
    return at;
  });
}
