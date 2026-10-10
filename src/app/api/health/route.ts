import { prisma } from "@/lib/db/client";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ ok: true, db: true });
  } catch {
    return json({ ok: false, db: false }, 503);
  }
}
