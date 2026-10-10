/**
 * Seed: beheerdersaccount (uit ADMIN_EMAIL/ADMIN_PASSWORD) en een voorbeeld-zoekprofiel.
 * Met SEED_DEMO=1 worden bovendien duidelijk gemarkeerde voorbeeldadvertenties geladen.
 * Er worden NOOIT nep-advertenties als echte data aangemaakt.
 */
import "../src/worker/env";
import { prisma } from "../src/lib/db/client";
import { hashPassword } from "../src/lib/security/crypto";
import { saveTree } from "../src/lib/pipeline/tree";
import { loadDemoData } from "../src/lib/pipeline/demo";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user && (await prisma.user.count()) === 0) {
    if (!password || password.length < 10) {
      console.log("Geen ADMIN_PASSWORD (min. 10 tekens) opgegeven; maak het eerste account via /setup in de browser.");
    } else {
      user = await prisma.user.create({ data: { email, name: "Beheerder", passwordHash: hashPassword(password), role: "ADMIN" } });
      console.log(`Beheerder aangemaakt: ${email}`);
    }
  }
  if (user && (await prisma.searchProfile.count({ where: { userId: user.id } })) === 0) {
    const p = await prisma.searchProfile.create({
      data: { userId: user.id, name: "iPhone 15 Pro inkoop", sourceKind: "MANUAL_URL", sourceConfig: { urls: [] }, intervalMinutes: 60, notifyMinScore: 75 },
    });
    await saveTree(p.id, {
      op: "AND",
      children: [
        { field: "modelKey", operator: "in", value: ["iphone-15-pro"] },
        { field: "storageGb", operator: "in", value: [128, 256] },
        { field: "askingEuro", operator: "lte", value: 400 },
        { field: "expectedProfitEuro", operator: "gte", value: 100 },
        { field: "roiPct", operator: "gte", value: 25 },
        { field: "distanceKm", operator: "lte_if_known", value: 100 },
        { field: "batteryHealth", operator: "gte_if_known", value: 85 },
        { field: "hasDefect", operator: "isFalse" },
        { field: "activationLock", operator: "neq", value: "locked" },
        { field: "photoCount", operator: "gte", value: 1 },
      ],
    });
    console.log("Voorbeeld-zoekprofiel aangemaakt (voeg advertentie-URL's toe in de app).");
  }
  if (process.env.SEED_DEMO === "1") {
    const r = await loadDemoData();
    console.log(`Voorbeelddata geladen: ${r.ads} advertenties (gemarkeerd als demo).`);
  }
}
main().finally(() => prisma.$disconnect());
