# iSelectStore — Inkoopradar

De huidige implementatie, bronbeperkingen, herstelprocedure en verificatie staan in [RADAR-2-IMPLEMENTATIE.md](docs/RADAR-2-IMPLEMENTATIE.md). De nieuwe worker migreert bestaande beheerdersprofielen eenmalig en herstelbaar naar één radar. Productie-uitrol is een afzonderlijke stap.

## Bestaande applicatie

Webapp voor handelaren in tweedehands Apple-producten: advertenties verzamelen, producten herkennen, marktwaarde schatten, winst berekenen, risico's detecteren, scoren (0–100) en de beste inkoopdeals melden via Telegram.

> **Marktplaats:** de app zoekt zelf op jouw zoektermen via de publieke zoekpagina's die robots.txt toestaat (de verboden JSON-API wordt niet gebruikt), past jouw filters toe en haalt alle resultaten op. Dit is live getest, maar robots.txt is geen gebruiksvoorwaarde: lees [docs/DATABRONNEN.md](docs/DATABRONNEN.md) en controleer de voorwaarden van Marktplaats.

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui-stijl componenten · PostgreSQL + Prisma 6 · Zod · Recharts · DB-gebaseerde jobwachtrij · Telegram/Discord · Vitest + Playwright.

## Snel starten (lokaal)

```bash
cp .env.example .env            # vul APP_SECRET (openssl rand -hex 32) en DATABASE_URL in
npm install
npx prisma migrate deploy       # of: npm run db:migrate
npm run db:seed                 # optioneel: admin + voorbeeldprofiel (SEED_DEMO=1 voor demodata)
npm run dev                     # http://localhost:3000  (eerste bezoek: /setup)
npm run worker                  # in een tweede terminal: achtergrondjobs
```

Zonder database-seed maakt u het eerste account via `/setup`. Wilt u eerst rondkijken: *Importeren → Voorbeelddata laden*.

### Docker
```bash
echo "APP_SECRET=$(openssl rand -hex 32)" > .env
docker compose up --build       # web op :3000, worker en Postgres inbegrepen
```

### Productie (Vercel + beheerde Postgres, bijv. Neon)
1. Zet `DATABASE_URL`, `APP_SECRET`, `CRON_SECRET` als omgevingsvariabelen. Draai `npx prisma migrate deploy` (CI of lokaal tegen de productie-DB).
2. Voer `prisma migrate deploy` als afzonderlijke release-stap tegen de bedoelde database uit. `vercel.json` bouwt zonder databasemutaties en roept dagelijks `/api/jobs/tick` aan (Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET`). Het Hobby-plan staat alleen dagelijkse crons toe: laat voor frequentere controles een externe scheduler (bijv. cron-job.org) elke 5 minuten `POST /api/jobs/tick` aanroepen met header `Authorization: Bearer <CRON_SECRET>`, of verhoog de cron op een betaald plan. Gebruik voor Neon de directe (niet-pooler) URL met `?sslmode=require&connection_limit=5`.
3. Op Vercel is geen permanente worker: de tick verwerkt per aanroep maximaal `jobsPerTick` jobs binnen 60 s.
4. Eigen server: Docker Compose (hierboven) of `npm run build && npm start` + `npm run worker` onder systemd/pm2, achter HTTPS (cookies zijn `Secure` in productie).

## Functies (gerealiseerd)

| Onderdeel | Status |
|---|---|
| **Automatisch zoeken op Marktplaats** (zoektermen + categorie + filters, begrensde pagina-dekking, volledige tekst asynchroon) | ✅ live getest |
| **Eigen filters** (Instellingen → Mijn filters): maken, wijzigen, toepassen op het dashboard en laden in zoekprofielen | ✅ |
| **Volledige Apple-lijst** (±130 modellen + accessoires) als doorzoekbare productkiezer; **Apple-categorieën van Marktplaats** (live opgehaald, vernieuwbaar) | ✅ |
| **Alle foto's** van een advertentie (detailpagina, hoge resolutie, automatisch bij openen) | ✅ |
| Data acquisition: URL-import, JSON/CSV-import, feed-profielen, demodata; adapter-architectuur; dedup op id + titel/foto/prijs/plaats | ✅ |
| Productherkenning: iPhone 11+/SE, MacBook Air/Pro (Intel/M1–M5), iPad, Watch, AirPods, Mac mini/iMac/Studio, accessoires; spelfouten ("ipone 14", "iphone 15pro 256 batterij 91"); onderscheid *vastgesteld / volgens verkoper / AI-inschatting / onbekend*; verzint niets | ✅ |
| Optionele AI-verrijking (Anthropic/OpenAI/compatibel), gevalideerd JSON, cache, dagbudget, optioneel foto's | ✅ (vereist uw API-sleutel) |
| Marktwaarde: gewogen mediaan, IQR-uitschieters, vraag vs. gerealiseerd, batterij/conditie, laag/verwacht/optimistisch, betrouwbaarheid, expliciet "onzeker", handmatige verkoopprijzen | ✅ |
| Winst: alle kosten, btw (geen/standaard/margeregeling alleen bij bevestiging), bruto/netto marge, rendement, **minimale verkoopprijs en maximaal bod**, conservatief/optimistisch | ✅ |
| Dealscore 0–100 (aanpasbare gewichten/grenzen), caps bij onzekerheid, uitleg | ✅ |
| Risico: blokkades (iCloud/MDM/gestolen/IMEI/defect/onderdelen/water), oplichtingspatronen, "te mooi om waar te zijn", prompt-injectie, *handmatige controle vereist* | ✅ |
| Zoekprofielen met AND/OR-regelboom (relationeel opgeslagen), snelle filters | ✅ |
| Telegram (en Discord) meldingen, per profiel, zonder duplicaten | ✅ |
| Web Push/PWA op iOS 16.4+ (geïnstalleerde webapp), testpush en voorkeuren; mailbox-alerts als invoer | ✅ geïmplementeerd; echte iPhone-ontvangst apart verifiëren |
| Dashboard in iSelectStore-stijl (statistiektegels, categorieën, nieuwste deals, realtime meldingen), `/deals` (kaarten/tabel, filters, afstand), `/notifications`, `/stats`, detailpagina, light/dark, responsive | ✅ |
| Inkoop-/verkoopadministratie + statistieken; verkopen voeden waardering | ✅ |
| Jobs: wachtrij, retry/backoff, rate limiting, dagelijkse requestlimiet, foutregistratie, statuspagina | ✅ |
| Beveiliging: login (scrypt + JWT-cookie), server-side autorisatie, CSRF-origincheck, SSRF-bescherming, AES-256-GCM voor geheimen, geheimen nooit terug naar frontend, log-redactie, ad-tekst nooit als instructie | ✅ |

## Externe integraties die uw credentials/toestemming vereisen
- **Toestemming/voorwaarden van Marktplaats** voor geautomatiseerd gebruik (de app gebruikt alleen door robots.txt toegestane pagina's) — zie docs/DATABRONNEN.md.
- **Telegram**: bot-token (@BotFather) + chat-ID. **Discord**: webhook-URL.
- **AI-provider** (optioneel, betaald): API-sleutel; kosten worden begrensd via dag-limieten.
- Gerealiseerde marktprijzen: er is geen publieke bron; vul ze in via *Mijn inkopen* of *Marktdata*.

## Aannames die u moet beoordelen
Instelbaar onder *Instellingen*: vraagprijs→verkoopprijs-factor (0,92), opslagstap (10%/verdubbeling), reparatiekosten (scherm €120, achterkant €100, camera €80), batterijkorting, verkoopbaarheidsprioriteiten per productfamilie, "verdacht lage prijs" < 55% van marktwaarde. Het zijn startwaarden, geen marktfeiten. Winstberekeningen zijn indicatief en geen fiscaal advies.

## Testen
```bash
npm test               # 423 unit- + integratietests (Postgres vereist; gebruikt DB dealhunter_test)
npm run lint           # TypeScript
npm run test:e2e       # Playwright (bouwt niet; draai eerst `npm run build`; DB dealhunter_e2e)
```
Testdatabases: maak `dealhunter_test` en `dealhunter_e2e` aan (zie `TEST_DATABASE_URL` / `E2E_DATABASE_URL`).

## Projectstructuur
`src/lib/engines/*` (herkenning, waardering, winst, scoring, risico, filters, dedup — pure functies) · `src/lib/pipeline/*` (ingest, analyse, matching) · `src/lib/sources/*` (adapters) · `src/lib/jobs/*` (wachtrij, handlers) · `src/lib/notify/*` · `src/app/api/*` · `src/app/(app)/*` (UI) · `prisma/` (schema, migraties, seed).
