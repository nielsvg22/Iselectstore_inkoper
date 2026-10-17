import "../src/worker/env";
import { prisma } from "../src/lib/db/client";
async function main() {
  try {
    const row = await prisma.appSettings.findUnique({
      where: { key: "worker:heartbeat" },
    });
    const at = (row?.value as { at?: string } | null)?.at;
    if (!at || Date.now() - Date.parse(at) > 90000) process.exitCode = 1;
  } catch {
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
