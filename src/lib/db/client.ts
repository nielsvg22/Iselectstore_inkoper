import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma: PrismaClient = g.__prisma ?? new PrismaClient({ log: process.env.PRISMA_LOG ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;
