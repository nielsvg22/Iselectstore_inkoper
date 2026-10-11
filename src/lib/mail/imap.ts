import { ImapFlow } from "imapflow";

export interface MailMsg {
  uid: number;
  source: Buffer;
}

export interface MailboxSnapshot {
  uidValidity: string;
  /** hoogste UID in de map op dit moment */
  maxUid: number;
  messages: MailMsg[];
}

/** Minimale abstractie zodat de verwerking zonder echte IMAP-server te testen is. */
export interface MailClient {
  /** Nieuwe berichten met UID > lastUid (lastUid null = alleen de stand opnemen, niets ophalen). */
  fetchNew(lastUid: number | null, limit: number): Promise<MailboxSnapshot>;
  /** Laatste n berichten (voor "test verbinding"). */
  recent(n: number): Promise<MailMsg[]>;
}

export interface ImapSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  folder: string;
}

/** Maakt van technische IMAP-/netwerkfouten een begrijpelijke melding (zonder gevoelige details). */
export function friendlyImapError(e: unknown): Error {
  const err = e as { authenticationFailed?: boolean; code?: string; responseText?: string; serverResponseCode?: string; message?: string };
  if (err.authenticationFailed || err.serverResponseCode === "AUTHENTICATIONFAILED") return new Error("Inloggen mislukt: controleer gebruiker en (app-)wachtwoord. Bij Gmail/Outlook/iCloud heb je een app-wachtwoord nodig en moet IMAP aan staan.");
  if (err.serverResponseCode === "NONEXISTENT" || /mailbox|folder|doesn't exist|does not exist|unknown/i.test(err.responseText ?? "")) return new Error(`Map niet gevonden (${(err.responseText ?? "").slice(0, 80)}). Controleer de mapnaam, meestal INBOX.`);
  if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") return new Error("Server niet gevonden: controleer de IMAP-servernaam.");
  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ETIMEOUT" || err.code === "ECONNRESET") return new Error("Server niet bereikbaar: controleer servernaam en poort (meestal 993).");
  if (/certificate|self.signed|CERT_/i.test(`${err.code ?? ""} ${err.message ?? ""}`)) return new Error("Het TLS-certificaat van de mailserver wordt niet vertrouwd. Gebruik de officiële IMAP-server van je provider.");
  return new Error((err.responseText || err.message || "Onbekende IMAP-fout").toString().slice(0, 160));
}

/** Alleen-lezen IMAP over TLS (certificaat wordt gecontroleerd). Er wordt niets gewijzigd of verwijderd in de mailbox. */
export function imapClient(s: ImapSettings): MailClient {
  const open = () => {
    const c = new ImapFlow({ host: s.host, port: s.port, secure: true, auth: { user: s.user, pass: s.password }, logger: false, tls: { rejectUnauthorized: true }, socketTimeout: 30_000, greetingTimeout: 15_000 });
    // Fouten komen via de aangeroepen methodes terug; een los 'error'-event mag het proces nooit laten crashen
    c.on("error", () => undefined);
    return c;
  };
  const close = async (c: ImapFlow) => {
    try {
      await c.logout();
    } catch {
      c.close();
    }
  };
  return {
    async fetchNew(lastUid, limit) {
      const c = open();
      try {
        await c.connect();
        const lock = await c.getMailboxLock(s.folder, { readOnly: true });
        try {
        const mb = c.mailbox as { uidValidity: bigint | number; uidNext: number };
        const maxUid = Math.max(0, (mb.uidNext ?? 1) - 1);
        const uidValidity = String(mb.uidValidity);
        if (lastUid == null || lastUid >= maxUid) return { uidValidity, maxUid, messages: [] };
        const messages: MailMsg[] = [];
        for await (const m of c.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
          if (m.uid > lastUid && m.source) messages.push({ uid: m.uid, source: m.source });
          if (messages.length >= limit) break;
        }
        return { uidValidity, maxUid, messages };
        } finally {
          lock.release();
        }
      } catch (e) {
        throw friendlyImapError(e);
      } finally {
        await close(c);
      }
    },
    async recent(n) {
      const c = open();
      try {
        await c.connect();
        const lock = await c.getMailboxLock(s.folder, { readOnly: true });
        try {
        const mb = c.mailbox as { uidNext: number };
        const from = Math.max(1, (mb.uidNext ?? 1) - 60);
        const all: MailMsg[] = [];
        for await (const m of c.fetch(`${from}:*`, { uid: true, source: true }, { uid: true })) if (m.source) all.push({ uid: m.uid, source: m.source });
        return all.slice(-n);
        } finally {
          lock.release();
        }
      } catch (e) {
        throw friendlyImapError(e);
      } finally {
        await close(c);
      }
    },
  };
}
