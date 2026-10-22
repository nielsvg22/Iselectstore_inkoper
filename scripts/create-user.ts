/**
 * Maakt een account rechtstreeks in de database aan (zelfde velden als het eerste beheerdersaccount).
 *   npx tsx scripts/create-user.ts info@bestbuyphone.nl [ADMIN|USER] ["Naam"]
 * Het tijdelijke wachtwoord wordt eenmalig in de terminal getoond (niet gelogd, alleen als hash opgeslagen).
 * Een bestaand e-mailadres wordt nooit overschreven.
 */
import "../src/worker/env";
import { prisma } from "../src/lib/db/client";
import { hashPassword } from "../src/lib/security/crypto";
import { generatePassword } from "../src/lib/users";

async function main() {
  const [emailArg, roleArg = "ADMIN", name] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Gebruik: create-user.ts <e-mail> [ADMIN|USER] [naam]");
  if (roleArg !== "ADMIN" && roleArg !== "USER") throw new Error("Rol moet ADMIN of USER zijn");
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`Account bestaat al: ${email} (niet gewijzigd)`);
    return;
  }
  const password = generatePassword();
  const u = await prisma.user.create({ data: { email, name: name ?? null, role: roleArg, passwordHash: hashPassword(password) }, select: { id: true } });
  await prisma.auditLog.create({ data: { action: "user.created", entity: "User", entityId: u.id, meta: { via: "script", role: roleArg } } });
  console.log(`Account aangemaakt: ${email} (${roleArg})\nTijdelijk wachtwoord (één keer getoond): ${password}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
