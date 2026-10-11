/**
 * Rooktest van de IMAP-koppeling tegen een echte (lokale) IMAP-server met TLS.
 *   NODE_EXTRA_CA_CERTS=cert.pem IMAP_MAILDIR=/pad/naar/maildir npx tsx scripts/imap-smoke.ts host port gebruiker wachtwoord
 */
import { writeFileSync } from "node:fs";
import { imapClient } from "../src/lib/mail/imap";
import { extractAdLinks } from "../src/lib/mail/links";
import { simpleParser } from "mailparser";

const [host, port, user, password] = process.argv.slice(2);
const dir = process.env.IMAP_MAILDIR!;
let n = 0;
const drop = (html: string) => writeFileSync(`${dir}/new/${Date.now()}.${n++}.M1P1.testhost`, ["From: Marktplaats <noreply@marktplaats.nl>", "To: ik@example.com", "Subject: Nieuw bij iPhone", `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", html].join("\r\n"));

async function main() {
  drop('<a href="https://www.marktplaats.nl/v/x/y/m2460000010-oud">oud</a>');
  const c = imapClient({ host, port: Number(port), user, password, folder: "INBOX" });
  const base = await c.fetchNew(null, 20);
  console.log("basis: uidValidity", base.uidValidity, "maxUid", base.maxUid, "berichten", base.messages.length);
  drop('<a href="https://click.marktplaats.nl/r?u=' + encodeURIComponent("https://www.marktplaats.nl/v/x/y/m2460000011-nieuw-iphone") + '">nieuw</a>');
  const t = Date.now();
  const next = await c.fetchNew(base.maxUid, 20);
  console.log("nieuw:", next.messages.length, "bericht(en) in", Date.now() - t, "ms; uid", next.messages.map((m) => m.uid));
  const mail = await simpleParser(next.messages[0].source);
  console.log("onderwerp:", mail.subject, "| links:", extractAdLinks(typeof mail.html === "string" ? mail.html : "", mail.text ?? "").map((l) => l.externalId));
  console.log("recent:", (await c.recent(5)).length);
  const again = await c.fetchNew(next.maxUid, 20);
  console.log("zelfde stand opnieuw:", again.messages.length, "berichten (verwacht 0)");
  try {
    await imapClient({ host, port: Number(port), user, password: "fout", folder: "INBOX" }).fetchNew(null, 1);
    console.log("FOUT: verkeerd wachtwoord werd geaccepteerd");
  } catch (e) {
    console.log("verkeerd wachtwoord geweigerd:", (e as Error).message);
  }
  try {
    await imapClient({ host, port: Number(port), user, password, folder: "BESTAATNIET" }).fetchNew(null, 1);
  } catch (e) {
    console.log("onbekende map:", (e as Error).message.slice(0, 80));
  }
}
void main();
