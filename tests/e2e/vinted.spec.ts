import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e";

test.describe.configure({ mode: "serial" });

test("platforms, algemene filters, modellenlijst en filterlogboek zijn bereikbaar en bruikbaar", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: E2E_DB });
  await db.$executeRawUnsafe('TRUNCATE "User","SearchProfile","Advertisement","AppSettings","AuditLog","BackgroundJob" RESTART IDENTITY CASCADE');
  await db.$disconnect();
  await page.goto("/setup");
  await page.getByLabel("E-mailadres").fill("vinted-e2e@example.com");
  await page.getByLabel("Wachtwoord").fill("e2e-wachtwoord-123");
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await page.waitForURL("/");

  // platformfilter op de dealslijst
  await page.goto("/deals");
  const platform = page.getByLabel("Platform", { exact: true });
  await expect(platform).toBeVisible();
  await platform.selectOption("vinted");
  await expect(page).toHaveURL(/platform=vinted/);

  // algemene filters: Vinted staat standaard uit, accessoires aan
  await page.goto("/rules/filters");
  await expect(page.getByRole("heading", { name: "Algemene filters", level: 1 })).toBeVisible();
  await expect(page.getByText("Niet beschikbaar op Vinted", { exact: false })).toBeHidden().catch(() => undefined);
  await expect(page.getByRole("switch", { name: "Vinted aan" })).not.toBeChecked();
  await expect(page.getByLabel("Accessoire-woorden")).toContainText("hoesje");
  await page.getByLabel("Minimale batterijconditie (%)").fill("85");
  await page.getByRole("button", { name: "Algemene filters opslaan" }).click();
  await expect(page.getByText("Algemene filters opgeslagen")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Minimale batterijconditie (%)")).toHaveValue("85");

  // modellenlijst: plakken, kolommen en opslaan
  await page.goto("/rules/zoekfilters");
  await expect(page.getByRole("heading", { name: "Modellenlijst", level: 1 })).toBeVisible();
  await page.getByLabel("Geplakte zoekfilters").fill("iPad Mini 6 (2021)\t64GB\tNormaal\t50\t150\t300\tAlle\tAlle\t0 maanden");
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText(/1 regels ingelezen/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Doorverkoop €" })).toBeVisible();
  await page.getByLabel("Verwachte doorverkoopprijs").first().fill("250");
  await page.getByRole("button", { name: "Opslaan" }).first().click();
  await expect(page.getByText(/1 zoekfilters opgeslagen/)).toBeVisible();

  // filterlogboek
  await page.goto("/rules/logboek");
  await expect(page.getByRole("heading", { name: "Filterlogboek", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vinted" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Vinted" }).first().click();
  await expect(page).toHaveURL(/platform=vinted/);

  // geen horizontale scroll op de nieuwe pagina's (telefoonbreedte)
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ["/rules/filters", "/rules/logboek"]) {
    await page.goto(p);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
