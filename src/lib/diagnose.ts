import { prisma } from "./db/client";
import { getCooldown } from "./jobs/cooldown";
import { getPrefs, quietEndsAt } from "./notify/prefs";
import { getConfig } from "./settings/store";

export interface Check {
  id: string;
  title: string;
  status: "ok" | "warn" | "error";
  detail: string;
  /** wat de gebruiker kan doen */
  action?: string;
}

/** "Waarom krijg ik geen pushmelding?" — loopt de hele keten na en zegt wat er mist. */
export async function diagnose(userId: string, now = new Date()): Promise<Check[]> {
  const cfg = await getConfig(true);
  const prefs = await getPrefs(userId);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  const devices = await prisma.pushSubscription.findMany({ where: { userId }, select: { enabled: true, failures: true, lastSuccessAt: true, lastError: true, label: true } });
  const active = devices.filter((d) => d.enabled);
  if (!devices.length) add({ id: "device", title: "Pushapparaat", status: "error", detail: "Er is geen apparaat aangemeld voor pushmeldingen.", action: "Open de app via het icoon op je beginscherm, ga naar Instellingen → Pushmeldingen en tik op ‘Pushmeldingen inschakelen’. Test daarna met ‘Stuur testpush’." });
  else if (!active.length) add({ id: "device", title: "Pushapparaat", status: "error", detail: "Je apparaat is aangemeld maar staat uit (te veel fouten of handmatig uitgezet).", action: "Zet het apparaat aan bij Instellingen → Pushmeldingen en stuur een testpush." });
  else {
    const ok = active.some((d) => d.lastSuccessAt);
    add({ id: "device", title: "Pushapparaat", status: ok ? "ok" : "warn", detail: ok ? `${active.length} apparaat/apparaten actief; laatst bezorgd ${active.find((d) => d.lastSuccessAt)!.lastSuccessAt!.toLocaleString("nl-NL")}.` : `${active.length} apparaat aangemeld, maar er is nog nooit iets bezorgd.${active[0].lastError ? ` Laatste fout: ${active[0].lastError}` : ""}`, action: ok ? undefined : "Stuur een testpush. Komt die niet aan: controleer iOS Instellingen → Meldingen → iSelectStore en Focus/Niet storen." });
  }

  add({ id: "prefs", title: "Meldingsvoorkeuren", status: prefs.push && cfg.notifications.enabled ? (prefs.mode === "top" || prefs.minProfitEuro != null || prefs.minScore != null || prefs.profileIds.length ? "warn" : "ok") : "error", detail: !cfg.notifications.enabled ? "Meldingen staan globaal uit (Instellingen)." : !prefs.push ? "Pushmeldingen staan uit voor jouw account." : `Modus: ${prefs.mode === "top" ? "alleen topdeals" : "alle passende deals"}${prefs.minProfitEuro != null ? `, winst ≥ €${prefs.minProfitEuro}` : ""}${prefs.minScore != null ? `, score ≥ ${prefs.minScore}` : ""}${prefs.profileIds.length ? `, ${prefs.profileIds.length} geselecteerde profielen` : ""}.`, action: prefs.mode === "top" || prefs.minProfitEuro != null || prefs.minScore != null || prefs.profileIds.length ? "Voor ‘elke nieuwe iPhone’: kies ‘Alle passende deals’ en laat winst, score en profielen leeg." : undefined });

  const quiet = quietEndsAt(prefs, now);
  if (quiet) add({ id: "quiet", title: "Stilteperiode", status: "warn", detail: `Je stilteperiode loopt nog tot ${quiet.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}; meldingen worden daarna verstuurd.` });

  const cd = await getCooldown("marktplaats-search", now);
  if (cd) add({ id: "cooldown", title: "Marktplaats-blokkade", status: "error", detail: `Gepauzeerd tot ${cd.until.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}: ${cd.reason}`, action: "De app probeert het daarna rustig opnieuw. Verlaag eventueel de paginarem." });

  add({ id: "fast", title: "Snelle modus", status: cfg.scheduler.fast.enabled ? "ok" : "warn", detail: cfg.scheduler.fast.enabled ? `Aan (rem ${cfg.scheduler.fast.maxRequestsPerMinute} pagina’s/min).` : "Staat uit: profielen worden op het gewone interval (minuten) gecontroleerd en er komt geen voorlopige push.", action: cfg.scheduler.fast.enabled ? undefined : "Zet ‘Snelle modus toestaan’ aan bij Instellingen → Snelheid." });

  const profiles = await prisma.searchProfile.findMany({ where: { userId, active: true, sourceKind: "SEARCH" }, select: { name: true, notifyEnabled: true, lastSuccessAt: true, lastError: true, sourceConfig: true } });
  const withNotify = profiles.filter((p) => p.notifyEnabled);
  const checked = profiles.filter((p) => p.lastSuccessAt);
  const baselined = profiles.filter((p) => (p.sourceConfig as { baselineAt?: string } | null)?.baselineAt);
  const errors = profiles.filter((p) => p.lastError);
  add({ id: "profiles", title: "Zoekprofielen", status: !profiles.length ? "error" : !withNotify.length ? "error" : checked.length === 0 ? "warn" : "ok", detail: `${profiles.length} actief, ${withNotify.length} met meldingen, ${checked.length} al gecontroleerd, ${baselined.length} met afgeronde nulmeting${errors.length ? `, ${errors.length} met een fout` : ""}.`, action: !profiles.length ? "Zet een zoekprofiel aan (Zoekopdrachten)." : !withNotify.length ? "Zet ‘Meldingen’ aan in je zoekprofiel." : undefined });
  if (baselined.length < profiles.length) add({ id: "baseline", title: "Nulmeting", status: "warn", detail: `Bij de eerste controle van een profiel wordt vastgelegd wat er al stond; dat geeft nooit een melding. ${profiles.length - baselined.length} profielen hebben die eerste controle nog niet afgerond. Alleen advertenties die daarná verschijnen geven een melding.`, action: "Even geduld: de populaire modellen zijn binnen ±3–10 minuten klaar, de rest later." });

  const since = new Date(now.getTime() - 24 * 3600_000);
  const notes = await prisma.notification.findMany({ where: { userId, channel: "WEBPUSH", createdAt: { gte: since } }, select: { status: true, error: true, sentAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const by = (s: string) => notes.filter((n) => n.status === s).length;
  const lastErr = notes.find((n) => n.error);
  add({ id: "notifications", title: "Pushmeldingen (24 uur)", status: by("FAILED") ? "error" : notes.length ? "ok" : "warn", detail: notes.length ? `${notes.length} aangemaakt: ${by("SENT")} verzonden, ${by("PENDING")} in wachtrij, ${by("SKIPPED")} overgeslagen, ${by("FAILED")} mislukt.${lastErr ? ` Laatste fout: ${lastErr.error}` : ""}` : "Er is in de afgelopen 24 uur nog geen pushmelding aangemaakt.", action: notes.length ? (by("SKIPPED") ? "‘Overgeslagen’ betekent meestal: geen actief pushapparaat." : undefined) : "Dat is normaal direct na een nieuwe installatie (nulmeting). Komt er na ±15 minuten nog niets, kijk dan naar de punten hierboven." });

  const adsHour = await prisma.advertisement.count({ where: { isDemo: false, firstSeenAt: { gte: new Date(now.getTime() - 3600_000) } } });
  const lastRun = await prisma.checkRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, ok: true, error: true } });
  add({ id: "scraper", title: "Scraper", status: lastRun && now.getTime() - lastRun.startedAt.getTime() < 15 * 60_000 ? (lastRun.ok ? "ok" : "warn") : "error", detail: lastRun ? `Laatste controle ${Math.round((now.getTime() - lastRun.startedAt.getTime()) / 60000)} min geleden${lastRun.ok ? "" : ` (mislukt: ${lastRun.error})`}; ${adsHour} advertenties het laatste uur voor het eerst gezien.` : "Er is nog geen controle gedraaid.", action: lastRun ? undefined : "Controleer of de worker-service draait (Coolify)." });
  return checks;
}
