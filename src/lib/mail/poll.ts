import { simpleParser } from "mailparser";
import { prisma } from "../db/client";
import { errMsg, log } from "../log";
import { ingestAd } from "../pipeline/ingest";
import { getConfig, getSecret } from "../settings/store";
import { fetchListingUrl } from "../sources/adapters-shared";
import { SourceError } from "../sources/types";
import { imapClient, type MailClient } from "./imap";
import { extractAdLinks, otherMarktplaatsLinks } from "./links";

const KEY = "mail:state";

export interface MailState {
  uidValidity?: string;
  lastUid?: number;
  lastPollAt?: string;
  lastOkAt?: string;
  lastError?: string | null;
  mailsSeen: number;
  mailsMatched: number;
  adsFound: number;
  adsIngested: number;
  lastMail?: { subject: string; mailDate: string | null; processedAt: string; delaySec: number | null; links: number };
}

const empty = (): MailState => ({ mailsSeen: 0, mailsMatched: 0, adsFound: 0, adsIngested: 0 });

export async function getMailState(): Promise<MailState> {
  const row = await prisma.appSettings.findUnique({ where: { key: KEY } });
  return { ...empty(), ...((row?.value as Partial<MailState>) ?? {}) };
}
async function saveState(s: MailState) {
  await prisma.appSettings.upsert({ where: { key: KEY }, create: { key: KEY, value: s as object }, update: { value: s as object } });
}

export interface ProcessResult {
  matched: boolean;
  from: string;
  subject: string;
  date: Date | null;
  links: number;
  ingested: number;
  adIds: string[];
  errors: string[];
}

export interface ProcessDeps {
  fetchImpl?: typeof fetch;
  lookup?: (host: string) => Promise<string[]>;
  /** alleen "dry run": links tonen zonder iets op te halen of op te slaan */
  dryRun?: boolean;
}

/** Verwerkt één e-mail: herkent advertentielinks, haalt de advertentie op en zet de analyse klaar. */
export async function processMail(source: Buffer | string, deps: ProcessDeps = {}): Promise<ProcessResult> {
  const cfg = await getConfig();
  const mail = await simpleParser(source);
  const from = `${mail.from?.text ?? ""}`.toLowerCase();
  const res: ProcessResult = { matched: false, from, subject: mail.subject ?? "", date: mail.date ?? null, links: 0, ingested: 0, adIds: [], errors: [] };
  if (!from.includes(cfg.mail.fromContains.toLowerCase())) return res;
  res.matched = true;
  const html = typeof mail.html === "string" ? mail.html : "";
  const text = mail.text ?? "";
  const links = extractAdLinks(html, text).slice(0, 12);
  res.links = links.length;
  if (deps.dryRun) return res;
  for (const l of links) {
    try {
      const existing = await prisma.advertisement.findUnique({ where: { source_externalId: { source: "marktplaats", externalId: l.externalId } }, select: { id: true, detailFetchedAt: true } });
      if (existing?.detailFetchedAt) continue; // al volledig bekend (bijv. door het zoeken)
      const ad = await fetchListingUrl(l.url, { allowlist: cfg.sources.urlAllowlist, minSecondsBetween: process.env.NODE_ENV === "test" ? 0 : Math.max(1, cfg.limits.minSecondsBetweenRequests), fetchImpl: deps.fetchImpl, lookup: deps.lookup, throttleId: "mail-detail" });
      const r = await ingestAd({ ...ad, externalId: l.externalId, url: l.url }, { origin: "MANUAL_URL" });
      res.ingested++;
      res.adIds.push(r.adId);
    } catch (e) {
      res.errors.push(`${l.externalId}: ${errMsg(e)}`);
      if (e instanceof SourceError && /HTTP (403|429)/.test(e.message)) break; // niet doordrukken
    }
  }
  return res;
}

export interface PollResult {
  ok: boolean;
  skipped?: string;
  mails: number;
  ingested: number;
  error?: string;
}

/** Eén poll van de mailbox. `client` is alleen voor tests; `onNewAds` maakt de worker direct wakker. */
export async function pollMailbox(opts: { client?: MailClient; deps?: ProcessDeps; onNewAds?: () => void } = {}): Promise<PollResult> {
  const cfg = await getConfig();
  if (!cfg.mail.enabled) return { ok: true, skipped: "uit", mails: 0, ingested: 0 };
  const state = await getMailState();
  state.lastPollAt = new Date().toISOString();
  try {
    let client = opts.client;
    if (!client) {
      const password = await getSecret("imap.password");
      if (!cfg.mail.host || !cfg.mail.user || !password) throw new Error("Mailbox is niet volledig ingesteld (server, gebruiker en wachtwoord)");
      client = imapClient({ host: cfg.mail.host, port: cfg.mail.port, user: cfg.mail.user, password, folder: cfg.mail.folder });
    }
    const snap = await client.fetchNew(state.uidValidity === undefined ? null : (state.lastUid ?? null), 20);
    // Eerste keer, of de map is gewijzigd (UIDVALIDITY): alleen de huidige stand vastleggen — oude mails worden nooit verwerkt
    if (state.uidValidity !== snap.uidValidity || state.lastUid == null) {
      Object.assign(state, { uidValidity: snap.uidValidity, lastUid: snap.maxUid, lastOkAt: new Date().toISOString(), lastError: null });
      await saveState(state);
      return { ok: true, mails: 0, ingested: 0 };
    }
    let ingested = 0;
    for (const m of snap.messages) {
      const r = await processMail(m.source, opts.deps);
      state.mailsSeen++;
      if (r.matched) {
        state.mailsMatched++;
        state.adsFound += r.links;
        state.adsIngested += r.ingested;
        ingested += r.ingested;
        state.lastMail = { subject: r.subject.slice(0, 120), mailDate: r.date?.toISOString() ?? null, processedAt: new Date().toISOString(), delaySec: r.date ? Math.round((Date.now() - r.date.getTime()) / 1000) : null, links: r.links };
        if (r.errors.length) log("warn", "Mail: advertentie niet opgehaald", { errors: r.errors.slice(0, 3) });
      }
      state.lastUid = Math.max(state.lastUid ?? 0, m.uid);
    }
    state.lastOkAt = new Date().toISOString();
    state.lastError = null;
    await saveState(state);
    if (ingested > 0) opts.onNewAds?.();
    return { ok: true, mails: snap.messages.length, ingested };
  } catch (e) {
    state.lastError = errMsg(e).slice(0, 300);
    await saveState(state);
    return { ok: false, mails: 0, ingested: 0, error: state.lastError };
  }
}

/** "Test verbinding": toont de laatste Marktplaats-mails en wat eruit gehaald zou worden (er wordt niets opgeslagen). */
export async function testMailbox(client?: MailClient): Promise<{ ok: boolean; folderMails: number; matching: Array<{ subject: string; date: string | null; links: number; otherLinks: number }> }> {
  const cfg = await getConfig();
  let c = client;
  if (!c) {
    const password = await getSecret("imap.password");
    if (!cfg.mail.host || !cfg.mail.user || !password) throw new Error("Vul server, gebruiker en wachtwoord in en sla de instellingen eerst op");
    c = imapClient({ host: cfg.mail.host, port: cfg.mail.port, user: cfg.mail.user, password, folder: cfg.mail.folder });
  }
  const recent = await c.recent(40);
  const matching: Array<{ subject: string; date: string | null; links: number; otherLinks: number }> = [];
  for (const m of recent.reverse()) {
    const mail = await simpleParser(m.source);
    if (!`${mail.from?.text ?? ""}`.toLowerCase().includes(cfg.mail.fromContains.toLowerCase())) continue;
    const html = typeof mail.html === "string" ? mail.html : "";
    matching.push({ subject: (mail.subject ?? "").slice(0, 120), date: mail.date?.toISOString() ?? null, links: extractAdLinks(html, mail.text ?? "").length, otherLinks: otherMarktplaatsLinks(html, mail.text ?? "").length });
    if (matching.length >= 5) break;
  }
  return { ok: true, folderMails: recent.length, matching };
}
