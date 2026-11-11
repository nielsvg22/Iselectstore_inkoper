import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/security/crypto";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e";

test.describe.configure({ mode: "serial" });

test("Twan-voorinstelling staat er vanzelf in en de margeknop werkt per platform", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: E2E_DB });
  await db.$executeRawUnsafe('TRUNCATE "User","SearchProfile","Advertisement","AppSettings","AuditLog","BackgroundJob" RESTART IDENTITY CASCADE');
  // account direct in de database (de setup-route is beperkt tot 5 pogingen per 10 minuten en wordt door de andere specs gebruikt)
  await db.user.create({ data: { email: "twan-e2e@example.com", passwordHash: hashPassword("e2e-wachtwoord-123"), role: "ADMIN" } });
  await db.$disconnect();
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill("twan-e2e@example.com");
  await page.getByLabel("Wachtwoord").fill("e2e-wachtwoord-123");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL("/");

  // knop op het dashboard: standaard Normaal; Marktplaats op Druk zetten raakt Vinted niet
  await expect(page.getByRole("heading", { name: "Margeknop" })).toBeVisible();
  const mp = page.getByRole("group", { name: "Margestand Marktplaats" });
  const vi = page.getByRole("group", { name: "Margestand Vinted" });
  await expect(mp.getByRole("button", { name: /Normaal/ })).toHaveAttribute("aria-pressed", "true");
  await mp.getByRole("button", { name: /Druk/ }).click();
  await expect(page.getByText("Margeknop aangepast")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "Margestand Marktplaats" }).getByRole("button", { name: /Druk/ })).toHaveAttribute("aria-pressed", "true");
  await expect(vi.getByRole("button", { name: /Normaal/ })).toHaveAttribute("aria-pressed", "true");

  // dezelfde stand op de regelpagina; automatisch zet de handmatige knoppen vast
  await page.goto("/rules");
  await expect(page.getByRole("group", { name: "Margestand Marktplaats" }).getByRole("button", { name: /Druk/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Automatisch op basis van aanbod").click();
  await expect(page.getByLabel("Automatisch op basis van aanbod")).toBeChecked();
  await expect(page.getByText("Margeknop aangepast")).toBeVisible();
  await expect(page.getByRole("group", { name: "Margestand Vinted" }).getByRole("button", { name: /Rustig/ })).toBeDisabled();
  await page.getByLabel("Automatisch op basis van aanbod").click();
  await expect(page.getByLabel("Automatisch op basis van aanbod")).not.toBeChecked();
  await expect(page.getByRole("group", { name: "Margestand Vinted" }).getByRole("button", { name: /Rustig/ })).toBeEnabled();

  // de voorinstelling van Twan is zonder handmatig werk toegepast
  await expect(page.getByLabel("Margetabel")).toHaveValue("TWAN");
  await expect(page.getByLabel("Batterijaftrek-tabel")).toHaveValue("twan");
  await expect(page.getByLabel("Alleen met bekende prijs (series)")).toHaveValue("iphone-15");
  await expect(page.getByLabel(/Onlogisch lage prijs/)).toHaveValue("35");
  await expect(page.getByLabel(/Minimumprijs voor alle advertenties/)).toHaveValue("50");

  // hoge marge-banner en serieregel zitten in de tester (volledige opbouw)
  const audit = await page.request.get("/api/rules");
  const rules = (await audit.json()).rules;
  expect(rules.presetVersion).toBeGreaterThanOrEqual(1);
  expect(rules.dynamic.presets).toEqual({ marktplaats: "druk", vinted: "normaal" });
});
