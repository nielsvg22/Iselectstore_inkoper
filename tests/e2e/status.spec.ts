import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e" });
test.afterAll(() => db.$disconnect());

test("status: echte blokkadesignalen, automatisch herstel en uitsluitend Apeldoorn", async ({ page }) => {
  // Isolated local browser database only. These source events are test fixtures.
  await db.$executeRawUnsafe('TRUNCATE "User","SearchProfile","Advertisement","AppSettings","BackgroundJob","SourceHealth" RESTART IDENTITY CASCADE');
  await page.goto("/setup");
  await page.getByLabel("E-mailadres").fill("status-e2e@example.com");
  await page.getByLabel("Wachtwoord").fill("status-e2e-password-123");
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await expect(page).toHaveURL("/");
  const user = await db.user.findFirstOrThrow();
  await db.searchProfile.create({ data: { userId: user.id, name: "Status fixture", sourceKind: "SEARCH", sourceConfig: { fastMode: true }, lastSuccessAt: new Date() } });
  await db.appSettings.create({ data: { key: "worker:heartbeat", value: { at: new Date().toISOString() } } });
  await db.appSettings.create({ data: { key: "cooldown:marktplaats-search", value: { at: new Date().toISOString(), until: new Date(Date.now() + 900000).toISOString(), reason: "HTTP 403" } } });
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Worden we geblokkeerd?" })).toBeVisible();
  await expect(page.getByText("Toegang geweigerd · HTTP 403", { exact: true })).toBeVisible();
  await expect(page.getByText("Worker actief", { exact: true })).toBeVisible();
  await expect(page.getByText("Opnieuw proberen op zijn vroegst", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/source-status-mobile.png", fullPage: true });
  // No reload: the visible status page refreshes its stored measurements itself.
  await db.appSettings.update({ where: { key: "cooldown:marktplaats-search" }, data: { value: { at: new Date(Date.now() - 120000).toISOString(), until: new Date(Date.now() - 60000).toISOString(), reason: "HTTP 403" } } });
  await db.searchProfile.updateMany({ data: { lastSuccessAt: new Date() } });
  await expect(page.getByText("Zoeken werkt", { exact: true })).toBeVisible({ timeout: 25000 });
  const saved = await page.request.put("/api/settings", { data: { config: { radar: { cityOnly: "Apeldoorn" } } } });
  expect(saved.ok()).toBe(true);
  for (const [i, location] of ["Apeldoorn", "Ugchelen", "Omgeving Apeldoorn", null].entries()) {
    await db.advertisement.create({ data: { externalId: `m998877660${i}`, source: "marktplaats", origin: "SEARCH", title: `Lokale testadvertentie ${i}`, location, url: `https://www.marktplaats.nl/v/test/m998877660${i}-test`, contentHash: `city-${i}`, fingerprint: `city-${i}` } });
  }
  await page.goto("/");
  await expect(page.getByText(/Alleen Apeldoorn · geen verzending van buiten/)).toBeVisible();
  await expect(page.getByText("Lokale testadvertentie 0", { exact: true })).toBeVisible();
  for (const i of [1, 2, 3]) await expect(page.getByText(`Lokale testadvertentie ${i}`, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Bronstatus bekijken" }).click();
  await expect(page).toHaveURL("/status");
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "Teststand: alleen plaats Apeldoorn" })).toBeChecked();
});
