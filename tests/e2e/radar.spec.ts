import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({
  datasourceUrl:
    process.env.E2E_DATABASE_URL ??
    "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e",
});

test("radar: echte data, bewaren, filters, herstel en mobiel", async ({
  page,
}) => {
  // Alleen de geïsoleerde e2e-database. Geen productieseed of fictieve brondata in de app.
  await db.$executeRawUnsafe(
    'TRUNCATE "User","SearchProfile","Advertisement","AppSettings","BackgroundJob" RESTART IDENTITY CASCADE',
  );
  await page.goto("/setup");
  await page.getByLabel("E-mailadres").fill("radar-e2e@example.com");
  await page.getByLabel("Wachtwoord").fill("radar-e2e-password-123");
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await expect(
    page.getByRole("heading", { name: "iSelectStore — Inkoopradar" }),
  ).toBeVisible();
  await expect(
    page.getByText("Nog geen kansen in deze selectie"),
  ).toBeVisible();
  expect(
    (
      await page.request.put("/api/settings", {
        data: { config: { demoMode: false } },
      })
    ).ok(),
  ).toBe(true);
  const user = await db.user.findFirstOrThrow();
  const ad = await db.advertisement.create({
    data: {
      externalId: "m999999999",
      source: "marktplaats",
      origin: "SEARCH",
      title: "E2E iPhone 16 Pro",
      url: "https://www.marktplaats.nl/v/test/m999999999-test",
      askingPriceCents: 42000,
      location: "Apeldoorn",
      distanceKm: 8,
      shippingOptions: [],
      contentHash: "e2e",
      fingerprint: "e2e",
    },
  });
  await page.reload();
  await expect(page.getByText("Winst nog onzeker")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Bekijk op Marktplaats ↗" }),
  ).toHaveAttribute("href", ad.url);
  await expect(page.getByText("Lokaal ophalen")).toBeVisible();
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Opgeslagen ✓" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Opgeslagen", exact: true }).click();
  await expect(page.getByText("E2E iPhone 16 Pro")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/radar-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profiles");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Gebruik dit profiel" }).click();
  await expect(
    page.getByText("iSelectStore — Smart Inkoopradar"),
  ).toBeVisible();
  await page.getByText("Profielback-ups en herstel", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Herstel profielen" }),
  ).toBeVisible();
  expect(await db.savedFilter.count({ where: { userId: user.id } })).toBe(3);
  await page.goto("/performance");
  await expect(page.getByText("Worker:", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Officiële Search API", exact: true })).toBeVisible();
  await expect(page.getByText("Uitgeschakeld", { exact: true })).toBeVisible();
  await expect(page.getByText("Publicatie → detectie (alleen exacte tijdstippen)")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/performance-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText("Tijdlijn laatste 30 advertenties").click();
  await expect(
    page.getByRole("columnheader", { name: "Detectie", exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Marktplaats Search API", exact: true })).toBeVisible();
  await expect(page.getByLabel("Eigen Marktplaats OAuth access token", { exact: true })).toHaveValue("");
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Bekijk op Marktplaats ↗" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/radar-desktop.png",
    fullPage: true,
  });
});
test.afterAll(async () => {
  await db.$disconnect();
});
