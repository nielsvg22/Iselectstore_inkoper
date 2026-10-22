import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/security/crypto";
import { generatePassword } from "@/lib/users";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(100).optional(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  password: z.string().min(10, "Minimaal 10 tekens").max(200).optional(),
});

export const GET = route(async () => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, createdAt: true } });
  return { users };
}, { admin: true });

/** Beheerder maakt een account. Zonder wachtwoord wordt een tijdelijk wachtwoord gegenereerd dat alleen in dit antwoord staat. */
export const POST = route(async (req, { user }) => {
  const body = await readJson(req, createSchema);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw new HttpError(409, "Dit e-mailadres heeft al een account");
  const password = body.password ?? generatePassword();
  const created = await prisma.user.create({
    data: { email: body.email, name: body.name || null, role: body.role, passwordHash: hashPassword(password) },
    select: { id: true, email: true, name: true, role: true },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "user.created", entity: "User", entityId: created.id, meta: { role: created.role } } });
  return { user: created, password: body.password ? undefined : password };
}, { admin: true });
