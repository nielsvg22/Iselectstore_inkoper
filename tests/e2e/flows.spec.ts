import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const E2E_DB =
  process.env.E2E_DATABASE_URL ??
  "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e";
const EMAIL = "e2e@example.com";
const PASSWORD = "e2e-wachtwoord-123";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Schone database voor deze run
  const db = new PrismaClient({ datasourceUrl: E2E_DB });
  await db.$executeRawUnsafe(
    'TRUNCATE "User","SearchProfile","Advertisement","MarketComparable","ValuationHistory","AppSettings","BackgroundJob","SourceHealth","AiUsage","AiCache","AuditLog","Purchase" RESTART IDENTITY CASCADE',
  );
  await db.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page).toHaveURL("/");
}

test("toegang: niet-ingelogd wordt doorgestuurd; eerste-account setup werkt eenmalig", async ({
  page,
  request,
}) => {
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
  await expect(
    page.getByRole("heading", { name: "iSelectStore — Inkoopradar" }),
  ).toBeVisible();
  // API zonder sessie => 401
  const r = await request.get("/api/ads");
  expect(r.status()).toBe(401);
  // setup opnieuw => niet meer mogelijk
  const again = await request.post("/api/auth/setup", {
    data: { email: "x@example.com", password: "weer-een-wachtwoord" },
  });
  expect(again.status()).toBe(403);
});

test("lege toestand, daarna demodata laden en gemarkeerd tonen", async ({
  page,
}) => {
  await login(page);
  await page.goto("/deals");
  await expect(page.getByText("Nog geen advertenties")).toBeVisible();
  await page.screenshot({
    path: "tests/e2e/shots/01-leeg.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Importeren" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Advertenties importeren" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voorbeelddata laden" }).click();
  await expect(page.getByText("Voorbeelddata geladen")).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole("link", { name: "Deals", exact: true }).first().click();
  await expect(page).toHaveURL("/deals");
  await expect(page.getByText("Demonstratiemodus:")).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
  expect(await page.locator("article").count()).toBeGreaterThan(5);
  await expect(
    page.getByText("Voorbeeld", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/e2e/shots/02-dashboard-licht.png",
    fullPage: false,
  });
});

test("dashboard: statistiekkaarten, tabelweergave, sorteren en filteren", async ({
  page,
}) => {
  await login(page);
  for (const label of ["Nieuw vandaag", "Topkansen", "Gem. verwachte winst"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "tests/e2e/shots/00-dashboard-mockup.png" });
  await page.goto("/deals");
  await page.getByRole("button", { name: "Tabel" }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(
    page.getByRole("columnheader", { name: "Marktwaarde" }),
  ).toBeVisible();
  await page.getByLabel("Sorteren").selectOption("profit");
  await expect(page).toHaveURL(/sort=profit/);
  await page.getByRole("button", { name: "Kaarten" }).click();
  await page.getByLabel("Filter op titel").fill("macbook");
  await expect(page).toHaveURL(/q=macbook/);
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  for (const t of await cards.locator("h3").allTextContents())
    expect(t.toLowerCase()).toContain("macbook");
  await page.getByLabel("Filter op titel").fill("zzzonbestaand");
  await expect(
    page.getByText("Geen deals gevonden met deze filters"),
  ).toBeVisible();
});

test("advertentiedetail: analyse, kosten bewerken, correcties, favoriet, gekocht, verkocht", async ({
  page,
}) => {
  await login(page);
  await page.goto("/deals");
  await page.getByLabel("Sorteren").selectOption("score");
  await page.locator("article a[aria-label^='Analyse van']").first().click();
  await expect(page.getByText("Originele advertentietekst")).toBeVisible();
  for (const h of [
    "Productherkenning",
    "Winstberekening",
    "Marktwaardeschatting",
    "Risicoanalyse",
    "Uitleg van de score",
    "Prijshistorie",
    "Notities",
  ]) {
    await expect(page.getByText(h, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Maximaal bod")).toBeVisible();
  await expect(
    page.getByText("Geen echte advertentie (voorbeeld)"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Geen echte advertentie", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/e2e/shots/03-detail.png",
    fullPage: true,
  });

  // kosten bewerken -> herberekenen
  await page.getByLabel("Reparatiekosten (€)").fill("77");
  await page.getByRole("button", { name: /Opslaan & herberekenen/ }).click();
  await expect(
    page.getByText("Kosten opgeslagen en analyse herberekend"),
  ).toBeVisible();
  await expect(
    page.getByText("Reparatiekosten", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("€ 77", { exact: false }).first()).toBeVisible();

  // handmatige correctie
  await page.getByLabel("Batterijconditie (%)").fill("96");
  await page.getByRole("button", { name: "Correcties opslaan" }).click();
  await expect(
    page.getByText("Correcties opgeslagen; analyse herberekend"),
  ).toBeVisible();
  await expect(
    page.getByText("Vastgesteld", { exact: true }).first(),
  ).toBeVisible();

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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Opslaan" })
    .click();
  await expect(page.getByText("Toegevoegd aan Mijn inkopen")).toBeVisible();

  // Mijn inkopen: verkoop registreren
  await page.getByRole("link", { name: "Mijn inkopen" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Mijn inkopen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verkocht", exact: true }).click();
  await page.getByLabel("Verkoopprijs (€)").fill("450");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Opslaan" })
    .click();
  await expect(page.getByText(/Verkoop geregistreerd/)).toBeVisible();
  await expect(
    page.getByText("Gerealiseerde winst").locator(".."),
  ).toContainText("€");
  await expect(page.getByRole("table")).toContainText("€ 450");
  await page.screenshot({
    path: "tests/e2e/shots/04-inkopen.png",
    fullPage: true,
  });
});

test("zoekprofiel aanmaken met filters en AND/OR-groep, bewerken en pauzeren", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Zoekopdrachten" }).first().click();
  await page.getByRole("link", { name: "Eigen zoekopdracht" }).click();
  await expect(page.getByLabel("Databron")).toHaveValue("SEARCH");
  await expect(page.getByLabel("Zoektermen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verwijder iphone 15 pro" }),
  ).toBeVisible();
  await expect(page.getByLabel("Categorie")).toHaveValue(
    "telecommunicatie/mobiele-telefoons-apple-iphone",
  );
  await page.getByLabel("Naam").fill("E2E iPhone 15 Pro");
  await page.getByLabel("Maximale inkoopprijs").fill("400");
  await page.getByLabel("Minimale verwachte winst").fill("100");
  await page.getByLabel("Minimaal rendement").fill("25");
  await page.getByRole("button", { name: "128 GB" }).click();
  await page.getByRole("button", { name: "256 GB" }).click();
  await page.getByLabel("Zoek product").fill("15 pro");
  await page
    .getByRole("button", { name: "iPhone 15 Pro", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Verwijder iPhone 15 Pro", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "iPhone 15 Pro Max", exact: true })
    .click();
  await page.getByText("Defecte producten uitsluiten").click();
  await page.getByRole("button", { name: /Groep/ }).click();
  await page.getByLabel("Waarde").first().fill("zgan, als nieuw");
  await page.getByLabel("Veld").first().selectOption("text");
  await page.getByLabel("Operator").first().selectOption("containsAny");
  await page.getByLabel("Waarde").first().fill("zgan, als nieuw");
  await page.screenshot({
    path: "tests/e2e/shots/05-profiel-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Zoekprofiel aanmaken" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(
    page.getByRole("link", { name: "E2E iPhone 15 Pro" }),
  ).toBeVisible();
  // terug bewerken: waarden bewaard
  await page.getByRole("link", { name: "Bewerken" }).first().click();
  await expect(page.getByLabel("Maximale inkoopprijs")).toHaveValue("400");
  await expect(page.getByLabel("Pagina’s per zoekterm")).toHaveValue("3");
  await expect(
    page.getByRole("button", {
      name: "Verwijder iPhone 15 Pro Max",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "256 GB" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Waarde").first()).toHaveValue(
    "zgan, als nieuw",
  );
  await page.getByRole("button", { name: "Annuleren" }).click();
  await page.getByRole("button", { name: "Pauzeren" }).first().click();
  await expect(
    page.getByText(/Gepauzeerde en gearchiveerde profielen/),
  ).toBeVisible();
});

test("eigen filters: maken in Instellingen met productlijst, toepassen op dashboard, laden in profiel", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");
  // Apple-categorielijst van Marktplaats
  await expect(page.getByText("Apple op Marktplaats")).toBeVisible();
  await expect(page.getByText("Apple iPhones", { exact: true })).toBeVisible();
  await expect(
    page.getByText("telecommunicatie/mobiele-telefoons-apple-iphone").first(),
  ).toBeVisible();
  // nieuw filter met modellen uit de lijst
  await page.getByRole("button", { name: /Nieuw filter/ }).click();
  await page.getByLabel("Naam van het filter").fill("MacBooks onder €900");
  await page.getByRole("tab", { name: "MacBook" }).click();
  await page
    .getByRole("button", { name: "MacBook Air 13″ M2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "MacBook Air 13″ M1", exact: true })
    .click();
  await page.locator("#q-maxPrice").fill("900");
  await page.getByRole("button", { name: "Filter opslaan" }).click();
  await expect(page.getByText("Filter opgeslagen")).toBeVisible();
  await expect(page.getByText("MacBooks onder €900")).toBeVisible();
  await expect(page.getByText("2 modellen")).toBeVisible();
  await expect(page.getByText("≤ €900")).toBeVisible();
  // toepassen op het dashboard
  await page.goto("/deals");
  await page
    .getByLabel("Mijn filters")
    .selectOption({ label: "MacBooks onder €900" });
  await expect(page).toHaveURL(/filter=/);
  await expect(
    page.getByText(/volgens je filter “MacBooks onder €900”/),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await page.locator("article h3").allTextContents()).every((t) =>
        t.toLowerCase().includes("macbook"),
      ),
    )
    .toBe(true);
  // laden in een nieuw zoekprofiel
  await page.goto("/profiles/new");
  await page
    .getByLabel("Laad opgeslagen filter")
    .selectOption({ label: "MacBooks onder €900" });
  await expect(page.getByLabel("Maximale inkoopprijs")).toHaveValue("900");
  await expect(
    page.getByRole("button", {
      name: "Verwijder MacBook Air 13″ M2",
      exact: true,
    }),
  ).toBeVisible();
  // verwijderen
  await page.goto("/settings");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Verwijder MacBooks onder €900" })
    .click();
  await expect(page.getByText("Filter verwijderd")).toBeVisible();
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
  await expect(
    page
      .locator("[role=status]")
      .filter({ hasText: /Telegram|bereikbaar|token/i })
      .first(),
  ).toBeVisible();
});

test("importeren: SSRF-doelen worden geweigerd; CSV-import werkt", async ({
  page,
}) => {
  await login(page);
  await page.goto("/import");
  await page
    .getByLabel("Advertentie-URL's")
    .fill("https://169.254.169.254/latest/meta-data/");
  await page
    .getByRole("button", { name: /Importeren & analyseren/ })
    .first()
    .click();
  await expect(
    page.getByText(/privé|niet op de lijst|Host/i).first(),
  ).toBeVisible();
  await page
    .getByLabel("Inhoud van het bestand")
    .fill(
      "id;titel;prijs;url;plaats;omschrijving\nX1;iPhone 14 128GB;450;https://www.marktplaats.nl/v/x/m111-a;Utrecht;Batterij 90%",
    );
  await page
    .getByRole("button", { name: /Importeren & analyseren/ })
    .nth(1)
    .click();
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
  await page.getByRole("button", { name: "Accountmenu" }).first().click();
  await page.getByRole("menuitem", { name: /Donkere modus/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: "tests/e2e/shots/06-dashboard-donker.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("PWA: manifest, service worker en offline-pagina zijn openbaar; installatiehandleiding en pushinstellingen", async ({
  page,
  request,
}) => {
  // zonder sessie bereikbaar (vereist voor installeerbaarheid)
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  const manifest = await m.json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/?source=pwa",
    scope: "/",
    theme_color: "#1F3049",
    background_color: "#1F3049",
  });
  expect(
    manifest.icons.map(
      (i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`,
    ),
  ).toEqual(
    expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]),
  );
  for (const i of manifest.icons)
    expect((await request.get(i.src)).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const swText = await sw.text();
  expect(swText).toContain('addEventListener("push"');
  expect(swText).toContain('addEventListener("notificationclick"');
  expect(swText).toContain('startsWith("/api/")'); // API-verkeer wordt nooit gecachet
  expect((await request.get("/offline.html")).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);

  await login(page);
  const head = await page.goto("/");
  expect(head!.status()).toBe(200);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(
    page
      .locator(
        'meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]',
      )
      .first(),
  ).toHaveAttribute("content", "yes");
  // service worker wordt geregistreerd (localhost telt als veilige context)
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration("/")),
    null,
    { timeout: 15_000 },
  );

  await page.goto("/install");
  await expect(
    page.getByRole("heading", { name: "App installeren" }),
  ).toBeVisible();
  await expect(page.getByText("Zet op beginscherm").first()).toBeVisible();

  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Pushmeldingen" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Pushmeldingen inschakelen" })
      .or(
        page.getByText("Meldingen zijn voor deze site geblokkeerd.", {
          exact: false,
        }),
      ),
  ).toBeVisible();
  // mailbox-koppeling zichtbaar; wachtwoord is een geheim veld
  await expect(
    page.getByRole("heading", {
      name: "Mailbox koppelen (Marktplaats-zoekalerts)",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("IMAP-server")).toBeVisible();
  await expect(page.getByLabel("Wachtwoord / app-wachtwoord")).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: "Test verbinding" }),
  ).toBeVisible();
  await page.getByLabel("Welke deals").selectOption("top");
  await page.getByLabel("Alleen melden vanaf winst (€)").fill("120");
  await page.getByRole("button", { name: "Voorkeuren opslaan" }).click();
  await expect(page.getByText("Meldingsvoorkeuren opgeslagen")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Welke deals")).toHaveValue("top");
  await expect(page.getByLabel("Alleen melden vanaf winst (€)")).toHaveValue(
    "120",
  );
  await page.screenshot({
    path: "tests/e2e/shots/11-push-instellingen.png",
    fullPage: true,
  });
});

test("filters testen op bestaande advertenties, met uitleg per advertentie; prestatiepagina", async ({
  page,
}) => {
  await login(page);
  await page.goto("/profiles/new");
  await page.getByLabel("Maximale afstand (ophalen)").fill("45");
  await page.getByLabel("Onbekende afstand").selectOption("exclude");
  await page.getByRole("switch", { name: /Ver weg toch interessant/ }).click();
  await page.getByLabel("Minimale winst na verzendkosten").fill("150");
  await page.getByRole("button", { name: "Test filters" }).click();
  await expect(
    page.getByText(/\d+ van \d+ advertenties voldoen aan deze filters/),
  ).toBeVisible({ timeout: 20_000 });
  const rows = page.locator("ul[class*='divide-y'] button[aria-expanded]");
  expect(await rows.count()).toBeGreaterThan(0);
  await rows.last().click();
  await expect(page.getByText(/nu:/).first()).toBeVisible();
  await page.screenshot({
    path: "tests/e2e/shots/12-filtertest.png",
    fullPage: true,
  });

  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Prestaties" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Waarom krijg ik (nog) geen melding?" }),
  ).toBeVisible();
  await expect(page.getByText("Pushapparaat", { exact: true })).toBeVisible();
  await expect(page.getByText("Laatste succesvolle controle")).toBeVisible();
  await expect(page.getByText("Controle- en verwerkingsdoel")).toBeVisible();
  await expect(
    page.getByText("Verwerkingstijden (laatste 7 dagen)"),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/e2e/shots/13-prestaties.png",
    fullPage: true,
  });
});

test("één radar met herstelbare back-up vervangt het actieve overzicht", async ({
  page,
}) => {
  await login(page);
  await page.goto("/profiles");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Gebruik dit profiel" }).click();
  await expect(
    page.getByRole("link", { name: "iSelectStore — Smart Inkoopradar" }),
  ).toBeVisible();
  await page.getByText("Profielback-ups en herstel", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download JSON" }),
  ).toBeVisible();
  const data = await (await page.request.get("/api/profiles")).json();
  expect(
    data.profiles.filter((p: { active: boolean }) => p.active),
  ).toHaveLength(1);
  await page.screenshot({
    path: "tests/e2e/shots/14-centrale-radar.png",
    fullPage: true,
  });
});

test("mobiel: geen horizontale scroll en bottom-navigatie zichtbaar", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await login(page);
  await expect(
    page.getByRole("navigation", { name: "Hoofdnavigatie" }).last(),
  ).toBeVisible();
  for (const path of [
    "/",
    "/deals",
    "/notifications",
    "/stats",
    "/performance",
    "/install",
    "/profiles",
    "/purchases",
    "/market",
    "/import",
    "/status",
    "/settings",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `horizontale overflow op ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page.screenshot({ path: "tests/e2e/shots/07-mobiel.png" });
  await ctx.close();
});

test("echte advertentie: knop 'Ga naar advertentie' rechtsboven en scherpe foto's", async ({
  page,
}) => {
  await login(page);
  await page.request.post("/api/import/demo", { data: { action: "remove" } });
  const csv =
    "id;titel;prijs;url;plaats;omschrijving;fotos\nR1;iPhone 14 128GB;450;https://www.marktplaats.nl/v/x/m999-a;Utrecht;Batterij 90% icloud vrij. Ophalen.;https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/abc?rule=ecg_mp_eps$_82.jpg";
  expect(
    (
      await page.request.post("/api/import/file", { data: { content: csv } })
    ).status(),
  ).toBe(200);
  await page.request.post("/api/jobs/tick", { data: {} });
  await page.goto("/deals");
  await expect(page.locator("article").first()).toBeVisible();
  // kaart gebruikt 726×968 (code 85) i.p.v. de miniatuur (82)
  await expect(page.locator("article img").first()).toHaveAttribute(
    "src",
    /rule=ecg_mp_eps\$_85\.jpg$/,
  );
  await page.locator("article a[aria-label^='Analyse van']").first().click();
  const link = page.getByRole("link", { name: /Ga naar advertentie/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute(
    "href",
    "https://www.marktplaats.nl/v/x/m999-a",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  // knop staat rechtsboven naast de titel
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  const btn = await link.boundingBox();
  expect(btn!.x).toBeGreaterThan(h1!.x + 300);
  expect(btn!.y).toBeLessThan(h1!.y + 200);
  await expect(page.locator("main img").first()).toHaveAttribute(
    "src",
    /rule=ecg_mp_eps\$_86\.jpg$/,
  );
  await page.screenshot({ path: "tests/e2e/shots/08-echte-advertentie.png" });
});

test("mobiel: advertentie met veel foto's past op het scherm (geen horizontale overflow)", async ({ browser }) => {
  const db = new PrismaClient({ datasourceUrl: E2E_DB });
  const ad = await db.advertisement.create({
    data: {
      source: "marktplaats", origin: "MANUAL_URL", externalId: "m-overflow-1", url: "https://www.marktplaats.nl/v/x/m-overflow-1", title: "iPhone 12 128GB met veel foto's", description: "Gebruikte maar originele telefoon. ".repeat(20),
      askingPriceCents: 25000, fingerprint: "fp-overflow", status: "ANALYZED",
      images: { create: Array.from({ length: 12 }, (_, position) => ({ url: `https://images.marktplaats.com/api/v1/hz-mp-pro-listing/images/overflow${position}?rule=ecg_mp_eps$_82.jpg`, position })) },
    },
  });
  await db.$disconnect();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`/ads/${ad.id}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("button", { name: "Toon foto 12" })).toBeAttached();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontale overflow op de advertentiepagina").toBeLessThanOrEqual(1);
  const card = await page.locator("main img").first().boundingBox();
  expect(card!.x + card!.width).toBeLessThanOrEqual(391);
  await ctx.close();
});

test("service worker: een binnenkomende push wordt als melding aangemaakt (zonder tag-conflict, met klikpad)", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.context().grantPermissions(["notifications"], { origin: new URL(page.url()).origin });
  const cdp = await page.context().newCDPSession(page);
  const regIds: string[] = [];
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e: { registrations: Array<{ registrationId: string }> }) => e.registrations.forEach((r) => regIds.push(r.registrationId)));
  await cdp.send("ServiceWorker.enable");
  await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready; });
  await expect.poll(() => regIds.length).toBeGreaterThan(0);
  const send = (payload: object) => cdp.send("ServiceWorker.deliverPushMessage", { origin: new URL(page.url()).origin, registrationId: regIds[0], data: JSON.stringify(payload) });
  await send({ title: "iPhone 15 Pro 256GB 📍", body: "Max €500 · toegestaan vraag €400 / bieden €380", url: "/ads/abc", tag: "ad-abc", externalUrl: "https://www.marktplaats.nl/v/x" });
  await send({ title: "iPhone 14 128GB", body: "tweede", url: "/ads/def", tag: "ad-def" });
  const titles = async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, tag: n.tag, url: (n.data as { url: string }).url })));
  await expect.poll(async () => (await titles()).length).toBe(2);
  expect(await titles()).toEqual(expect.arrayContaining([{ title: "iPhone 15 Pro 256GB 📍", tag: "ad-abc", url: "/ads/abc" }, { title: "iPhone 14 128GB", tag: "ad-def", url: "/ads/def" }]));
  // zelfde tag vervangt, en een kapotte payload geeft toch een melding
  await send({ title: "iPhone 14 128GB (bijgewerkt)", body: "x", url: "/ads/def", tag: "ad-def" });
  await expect.poll(async () => (await titles()).find((n) => n.tag === "ad-def")?.title).toBe("iPhone 14 128GB (bijgewerkt)");
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: new URL(page.url()).origin, registrationId: regIds[0], data: "geen json" });
  await expect.poll(async () => (await titles()).some((n) => n.title === "iSelectStore")).toBe(true);
});

test("meldingen: controle toont de toestemming, knop vraagt toestemming en een lokale testmelding wordt aangemaakt", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  await page.goto("/settings");
  const box = page.getByLabel("Controle meldingen");
  await expect(box).toBeVisible();
  // eerst nog niet gevraagd: er is een knop om toestemming te vragen
  await expect(box.getByText("nog niet gevraagd")).toBeVisible();
  await expect(box.getByRole("button", { name: "Toestemming vragen" })).toBeVisible();
  // na toestemming: testmelding rechtstreeks uit de browser
  await ctx.grantPermissions(["notifications"], { origin: new URL(page.url()).origin });
  await box.getByRole("button", { name: "Opnieuw controleren" }).click();
  await expect(box.getByText("toegestaan")).toBeVisible();
  await box.getByRole("button", { name: "Toon testmelding op dit scherm" }).click();
  await expect(box.getByRole("status")).toContainText("De browser heeft de melding aangemaakt");
  const n = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((x) => x.title));
  expect(n).toContain("Testmelding van de app");
  await ctx.close();
});

test("uitloggen", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Accountmenu" }).first().click();
  await page.getByRole("menuitem", { name: "Uitloggen" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
