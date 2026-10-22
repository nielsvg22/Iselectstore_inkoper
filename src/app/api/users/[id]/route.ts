import { HttpError } from "@/lib/auth";
import { routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/security/crypto";
import { generatePassword } from "@/lib/users";

/** Beheerder zet een nieuw tijdelijk wachtwoord voor een gebruiker; het wachtwoord staat alleen in dit antwoord. */
export const POST = routeP<{ id: string }>(async (_req, { user, params }) => {
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, email: true } });
  if (!target) throw new HttpError(404, "Gebruiker niet gevonden");
  const password = generatePassword();
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash: hashPassword(password) } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "user.password_reset", entity: "User", entityId: target.id } });
  return { email: target.email, password };
}, { admin: true });
