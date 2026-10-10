import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e";
const EMAIL = "e2e@example.com";
const PASSWORD = "e2e-wachtwoord-123";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // Schone database voor deze run
  execSync(`psql "${E2E_DB}" -c 'TRUNCATE "User","SearchProfile","Advertisement","MarketComparable","ValuationHistory","AppSettings","BackgroundJob","SourceHealth","AiUsage","AiCache","AuditLog","Purchase" RESTART IDENTITY CASCADE'`, { stdio: "pipe" });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page).toHaveURL("/");
}

test("toegang: niet-ingelogd wordt doorgestuurd; eerste-account setup werkt eenmalig", async ({ page, request }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login|\/setup/);
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: /Welkom/ })).toBeVisible();
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill("kort");
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  // HTML5-validatie (minLength) blokkeert; nu geldig wachtwoord
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Beste deals van dit moment" })).toBeVisible();
  // API zonder sessie => 401
  const r = await request.get("/api/ads");
  expect(r.status()).toBe(401);
  // setup opnieuw => niet meer mogelijk
  const again = await request.post("/api/auth/setup", { data: { email: "x@example.com", password: "weer-een-wachtwoord" } });
  expect(again.status()).toBe(403);
});

test("lege toestand, daarna demodata laden en gemarkeerd tonen", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Nog geen advertenties")).toBeVisible();
  await page.screenshot({ path: "tests/e2e/shots/01-leeg.png", fullPage: true });
  await page.getByRole("link", { name: "Importeren" }).first().click();
  await expect(page.getByRole("heading", { name: "Advertenties importeren" })).toBeVisible();
  await page.getByRole("button", { name: "Voorbeelddata laden" }).click();
  await expect(page.getByText("Voorbeelddata geladen")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("link", { name: "Deals", exact: true }).first().click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Demonstratiemodus:")).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
  expect(await page.locator("article").count()).toBeGreaterThan(5);
  await expect(page.getByText("Voorbeeld", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "tests/e2e/shots/02-dashboard-licht.png", fullPage: false });
});

test("dashboard: statistiekkaarten, tabelweergave, sorteren en filteren", async ({ page }) => {
  await login(page);
  for (const label of ["Nieuw (24 uur)", "Interessante deals", "Potentiële winst", "Gemiddeld rendement", "Controle vereist"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Tabel" }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.getByRole("columnheader", { name: "Marktwaarde" })).toBeVisible();
  await page.getByLabel("Sorteren").selectOption("profit");
  await expect(page).toHaveURL(/sort=profit/);
  await page.getByRole("button", { name: "Kaarten" }).click();
  await page.getByLabel("Zoek in advertenties").fill("macbook");
  await expect(page).toHaveURL(/q=macbook/);
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  for (const t of await cards.locator("h3").allTextContents()) expect(t.toLowerCase()).toContain("macbook");
  await page.getByLabel("Zoek in advertenties").fill("zzzonbestaand");
  await expect(page.getByText("Geen deals gevonden met deze filters")).toBeVisible();
});

test("advertentiedetail: analyse, kosten bewerken, correcties, favoriet, gekocht, verkocht", async ({ page }) => {
  await login(page);
  await page.getByLabel("Sorteren").selectOption("score");
  await page.locator("article a[aria-label^='Analyse van']").first().click();
  await expect(page.getByText("Originele advertentietekst")).toBeVisible();
  for (const h of ["Productherkenning", "Winstberekening", "Marktwaardeschatting", "Risicoanalyse", "Uitleg van de score", "Prijshistorie", "Notities"]) {
    await expect(page.getByText(h, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Maximaal bod")).toBeVisible();
  await expect(page.getByText("Geen echte advertentie (voorbeeld)")).toBeVisible();
  await page.screenshot({ path: "tests/e2e/shots/03-detail.png", fullPage: true });

  // kosten bewerken -> herberekenen
  await page.getByLabel("Reparatiekosten (€)").fill("77");
  await page.getByRole("button", { name: /Opslaan & herberekenen/ }).click();
  await expect(page.getByText("Kosten opgeslagen en analyse herberekend")).toBeVisible();
  await expect(page.getByText("Reparatiekosten", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("€ 77", { exact: false }).first()).toBeVisible();

  // handmatige correctie
  await page.getByLabel("Batterijconditie (%)").fill("96");
  await page.getByRole("button", { name: "Correcties opslaan" }).click();
  await expect(page.getByText("Correcties opgeslagen; analyse herberekend")).toBeVisible();
  await expect(page.getByText("Vastgesteld", { exact: true }).first()).toBeVisible();

  // notities, favoriet
  await page.getByLabel("Notities").fill("Bellen na 18:00");
  await page.getByRole("button", { name: "Notitie opslaan" }).click();
  await expect(page.getByText("Notitie opgeslagen")).toBeVisible();
  await page.getByRole("button", { name: /Favoriet/ }).click();
  await expect(page.getByRole("button", { name: /Favoriet ✓/ })).toBeVisible();

  // herbereken
  await page.getByRole("button", { name: "Herbereken analyse" }).click();
  await expect(page.getByText("Analyse opnieuw berekend")).toBeVisible();

  // gekocht
  await page.getByRole("button", { name: /^Gekocht$/ }).click();
  await page.getByLabel("Werkelijke inkoopprijs (€)").fill("300");
  await page.getByRole("dialog").getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByText("Toegevoegd aan Mijn inkopen")).toBeVisible();

  // Mijn inkopen: verkoop registreren
  await page.getByRole("link", { name: "Mijn inkopen" }).first().click();
  await expect(page.getByRole("heading", { name: "Mijn inkopen" })).toBeVisible();
  await page.getByRole("button", { name: "Verkocht", exact: true }).click();
  await page.getByLabel("Verkoopprijs (€)").fill("450");
  await page.getByRole("dialog").getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByText(/Verkoop geregistreerd/)).toBeVisible();
  await expect(page.getByText("Gerealiseerde winst").locator("..")).toContainText("€");
  await expect(page.getByRole("table")).toContainText("€ 450");
  await page.screenshot({ path: "tests/e2e/shots/04-inkopen.png", fullPage: true });
});

test("zoekprofiel aanmaken met filters en AND/OR-groep, bewerken en pauzeren", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Zoekprofielen" }).first().click();
  await page.getByRole("link", { name: /Nieuw profiel/ }).click();
  await page.getByLabel("Naam").fill("E2E iPhone 15 Pro");
  await page.getByLabel("Maximale inkoopprijs").fill("400");
  await page.getByLabel("Minimale verwachte winst").fill("100");
  await page.getByLabel("Minimaal rendement").fill("25");
  await page.getByRole("button", { name: "128 GB" }).click();
  await page.getByRole("button", { name: "256 GB" }).click();
  await page.getByLabel("Productmodellen").fill("iphone-15-pro");
  await page.getByLabel("Productmodellen").press("Enter");
  await page.getByText("Defecte producten uitsluiten").click();
  await page.getByRole("button", { name: /Groep/ }).click();
  await page.getByLabel("Waarde").first().fill("zgan, als nieuw");
  await page.getByLabel("Veld").first().selectOption("text");
  await page.getByLabel("Operator").first().selectOption("containsAny");
  await page.getByLabel("Waarde").first().fill("zgan, als nieuw");
  await page.screenshot({ path: "tests/e2e/shots/05-profiel-editor.png", fullPage: true });
  await page.getByRole("button", { name: "Zoekprofiel aanmaken" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(page.getByRole("heading", { name: "E2E iPhone 15 Pro" })).toBeVisible();
  // terug bewerken: waarden bewaard
  await page.getByRole("link", { name: "Bewerken" }).first().click();
  await expect(page.getByLabel("Maximale inkoopprijs")).toHaveValue("400");
  await expect(page.getByRole("button", { name: "256 GB" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Waarde").first()).toHaveValue("zgan, als nieuw");
  await page.getByRole("button", { name: "Annuleren" }).click();
  await page.getByRole("button", { name: "Pauzeren" }).first().click();
  await expect(page.getByText("Gepauzeerd").first()).toBeVisible();
});

test("instellingen: geheimen worden nooit teruggetoond", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";
  await page.getByLabel("Telegram Bot Token").fill(token);
  await page.getByLabel("Telegram Chat ID").fill("4242");
  await page.getByLabel("Minimale winst (€)").fill("120");
  await page.getByRole("button", { name: "Instellingen opslaan" }).click();
  await expect(page.getByText("Instellingen opgeslagen")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Telegram Bot Token")).toHaveValue("");
  await expect(page.getByText(/Ingesteld \(versleuteld/).first()).toBeVisible();
  await expect(page.getByLabel("Minimale winst (€)")).toHaveValue("120");
  const html = await page.content();
  expect(html).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const api = await page.request.get("/api/settings");
  expect(await api.text()).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  // testmelding zonder netwerk => nette foutmelding (geen crash)
  await page.getByRole("button", { name: "Testmelding Telegram" }).click();
  await expect(page.locator("[role=status]").filter({ hasText: /Telegram|bereikbaar|token/i }).first()).toBeVisible();
});

test("importeren: SSRF-doelen worden geweigerd; CSV-import werkt", async ({ page }) => {
  await login(page);
  await page.goto("/import");
  await page.getByLabel("Advertentie-URL's").fill("https://169.254.169.254/latest/meta-data/");
  await page.getByRole("button", { name: /Importeren & analyseren/ }).first().click();
  await expect(page.getByText(/privé|niet op de lijst|Host/i).first()).toBeVisible();
  await page.getByLabel("Inhoud van het bestand").fill("id;titel;prijs;url;plaats;omschrijving\nX1;iPhone 14 128GB;450;https://www.marktplaats.nl/v/x/m111-a;Utrecht;Batterij 90%");
  await page.getByRole("button", { name: /Importeren & analyseren/ }).nth(1).click();
  await expect(page.getByText(/1 nieuw · 0 bijgewerkt/)).toBeVisible();
});

test("status, marktdata en thema", async ({ page }) => {
  await login(page);
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await expect(page.getByText("Databronnen")).toBeVisible();
  await page.getByRole("button", { name: "Nu verwerken" }).click();
  await expect(page.getByText(/job\(s\) verwerkt/)).toBeVisible();
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "Marktdata" })).toBeVisible();
  await page.getByLabel("Model-sleutel").first().fill("iphone-13");
  await page.getByLabel("Prijs (€)").first().fill("310");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await expect(page.getByText("Prijs toegevoegd")).toBeVisible();
  // dark mode
  await page.goto("/");
  await page.getByRole("button", { name: /donkere modus/ }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: "tests/e2e/shots/06-dashboard-donker.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("mobiel: geen horizontale scroll en bottom-navigatie zichtbaar", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await login(page);
  await expect(page.getByRole("navigation", { name: "Hoofdnavigatie" }).last()).toBeVisible();
  for (const path of ["/", "/profiles", "/purchases", "/market", "/import", "/status", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontale overflow op ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page.screenshot({ path: "tests/e2e/shots/07-mobiel.png" });
  await ctx.close();
});

test("uitloggen", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Uitloggen" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
