# Apple Deal Hunter 2.0 — oplevering

Opgeleverd op branch `claude/apple-deal-hunter` (lokaal gecommit; **niet gepusht en niet uitgerold** — wacht op jouw toestemming).
Voorafgaande analyse: [`FASE1-ANALYSE.md`](./FASE1-ANALYSE.md).

## 1. Wat is gerealiseerd

### Snelle detectieketen (Fase 2, 5, 6)
Marktplaats → scraper → voorselectie → analyse → profielmatch → melding.

| Verbetering | Detail |
|---|---|
| **Eerst opnemen, dan verrijken** | De zoekronde slaat resultaten direct op (voorselectie op prijs/model) en zet per nieuwe advertentie een `FETCH_DETAIL`-job klaar. Vroeger werden tot 40 detailpagina's (×3 s) *vóór* het opslaan opgehaald ⇒ minuten vertraging. |
| **Twee fases** | Fase 1 (direct): titel, prijs, locatie, afstand, specs, verkoperssignalen ⇒ voorlopige score/dashboard. Fase 2: detailpagina → volledige tekst/foto's → definitieve analyse → melding. |
| **Geen definitieve topdeal zonder volledige data** | Melding wacht tot de detailpagina is beoordeeld (`notifications.requireFullAnalysis`). Mislukt de detailpagina definitief (verkocht/verwijderd), dan volgt een **voorlopige** melding ("Voorlopig · …", "Controleer: …"). Onzekere waardering of handmatige controle ⇒ ook voorlopig. |
| **Scheduler** | Kortste interval instelbaar (standaard 10 min, **harde ondergrens 5 min**), profielen met "prioriteit nieuwe" eerst, achterstallige eerst. Vercel-cron blijft vangnet. |
| **Gedeelde paginacache** | Profielen met dezelfde zoekterm/categorie halen een pagina niet dubbel op (TTL instelbaar, standaard 120 s). Zichtbaar als "cache-treffers" in Prestaties. |
| **Parallel waar veilig** | Twee rijen: (1) netwerk naar Marktplaats = 1 loper, gepaceerd (≥3 s); (2) analyse/meldingen = 3 parallelle lopers. Per advertentie één analyse tegelijk (advisory lock). Voorrang: melding 30 › detail (nieuw) 25 › analyse (nieuw) 20 › controle (prio) 15. |
| **Worker** | Draait direct door zolang er werk is (idle-wachttijd 5 s i.p.v. vaste 20 s). |
| **Dedupe & herstel** | Advertenties (fingerprint), meldingen (`dedupeKey` per kanaal+advertentie(+profiel); push: **één per gebruiker per advertentie**), idempotente jobs (`uniqueKey`), retries met backoff (push max. 6), stale-job herstel. |
| **Meting** | `Advertisement.firstSeenAt/prefilteredAt/analyzedAt`, `Notification.createdAt/sentAt/attempts`, `CheckRun` per profielcontrole. Pagina **Prestaties** (`/performance`). |

### PWA + Web Push (Fase 3)
- Manifest (`/manifest.webmanifest`), standalone, iconen 192/512/maskable/apple-touch (huisstijl), iOS-splashschermen (9 formaten), service worker (`/public/sw.js`), offline-pagina, installatiehandleiding (`/install`), "Installeer app"-knop.
- **Veilig cachingbeleid:** nooit `/api` of ingelogde HTML cachen; alleen onveranderlijke statische bestanden + offline-pagina. SW met `no-cache`.
- Web Push met VAPID (`web-push`), abonnementen per gebruiker en apparaat (`PushSubscription`), testpush, per-apparaat aan/uit, verwijderen, automatische opruiming (404/410 direct; 8 opeenvolgende fouten ⇒ uit; >60 dagen stil ⇒ weg).
- Melding bevat: productnaam, vraagprijs, marktwaarde, verwachte winst, afstand, score, link; klik opent `/ads/<id>` in het portaal (SW focust/opent venster).
- Voorkeuren (Instellingen → Pushmeldingen): alle passende / alleen topdeals, minimale winst, minimale score, geselecteerde profielen, stilteperiode (uitgesteld, niet weggegooid), push aan/uit, Telegram: zoals profiel / alleen als alternatief / uit.

### Filterengine (Fase 4)
- Nieuwe velden: `sellerTrust`, `sellerTrustLevel`, `sellerVerified`, `shippingAvailable`, `pickupAvailable`, `batteryKnown`, `purchaseProof`; nieuwe operatoren `gt`, `lt`.
- **Afstand/verzending:** "Maximale afstand (ophalen)" + beleid onbekende afstand (doorlaten/uitsluiten) + **OF-regel** "ver weg toch interessant, mét verzending, betrouwbaarheid ≥ X, winst ≥ Y" (precies jouw voorbeeld; round-trip herkend in de editor). Globale kosten: reiskosten/km en verzendkosten worden automatisch in de winst meegenomen (Instellingen → Afstand & batterij: beleid; standaard 0 = uit).
- **Batterij:** minimum, uitsluiten onder X%, onbekend: toestaan/apart beoordelen/uitsluiten (filter én globaal beleid), vervangingskosten (optioneel in winst), correctie verkoopprijs (optioneel).
- **Verkopersbetrouwbaarheid:** uitlegbare score met per signaal de herkomst *Bevestigd / Volgens verkoper / Automatisch ingeschat / Onbekend*. Onbekend telt nooit als betrouwbaar; niveau "Voldoende onderbouwd" vereist minstens één door het platform bevestigd positief signaal. Zie ook "beperkingen".
- **Test deze filters op bestaande advertenties** (profiel-editor én Mijn filters): aantal treffers, meest blokkerende voorwaarden, per advertentie de boom met werkelijke waarde per voorwaarde.

### Snelle modus (aanvulling)
Voor "zo snel mogelijk handelen" — alles in de app, geen externe diensten:
- **Instellingen → Snelheid:** schakelaar *Snelle modus toestaan* (standaard **uit**), interval (standaard 60 s, min. 30 s), pagina's per zoekterm (standaard 2) en een totaalrem (standaard 6 pagina-requests/min over alle snelle profielen).
- **Per zoekprofiel:** schakelaar *Snelle modus*. Aanbevolen: smalle profielen per model (bijv. "iphone 16 pro", "iphone 15 pro max") i.p.v. één brede "iphone"-zoekopdracht — bij duizenden resultaten kijken we maar naar de eerste ±60.
- **Direct voorlopige push** zodra een nieuwe advertentie je filters haalt (op basis van lijstgegevens), daarna de **definitieve push** na de detailpagina. Beide hebben dezelfde `tag`, dus de tweede vervangt de eerste op je toestel. Geen dubbele meldingen bij herhaalde analyse.
- **Voorrang:** snelle controle (28) gaat vóór detailpagina's (25), zodat veel nieuwe advertenties de volgende controle niet vertragen.
- **Blokkade-rem:** HTTP 403/429 ⇒ automatische pauze 15 min, verdubbelend tot max. 2 uur; tijdens de pauze geen enkel request; zichtbaar op *Prestaties*. Er wordt niets omzeild.
- **Verwachte vertraging** (plaatsing → voorlopige push): gemiddeld ±30–40 s, in het slechtste geval ±70 s (60 s interval + ±1–5 s ophalen/verwerken). Gemeten eigen verwerking na ophalen: <1 s (testscenario). **Geen realtime-garantie**: staat een nieuwe advertentie buiten de opgehaalde pagina's of pauzeert de bron, dan komt de melding later. Meer verkeer naar Marktplaats kan in strijd zijn met hun voorwaarden; dat risico is een bewuste keuze van de gebruiker.

## 2. Gewijzigde/nieuwe bestanden (hoofdlijnen)
`prisma/schema.prisma`, `prisma/migrations/20261011142112_pipeline_metrics_push` ·
`src/lib/jobs/{queue,handlers,tick}.ts`, `src/worker/run.ts` · `src/lib/sources/{marktplaats-search,types}.ts`, `src/lib/pipeline/{ingest,analyze,context}.ts` ·
`src/lib/notify/{prefs,push,dispatch,message}.ts` · `src/lib/engines/{seller,policy}/`, `engines/{filters,risk}/` · `src/lib/{metrics,profile-quick,pwa-client}.ts` · `src/lib/config/schema.ts` ·
API: `/api/push/{vapid,subscribe,unsubscribe,test,devices,devices/[id]}`, `/api/notify/prefs`, `/api/filters/test` ·
UI: `settings` (Pushmeldingen, Snelheid, Beleid), `/install`, `/performance`, `components/{notify,pwa,filters,ad}/…` ·
PWA: `src/app/manifest.ts`, `public/{sw.js,offline.html,icons/,splash/}`, `scripts/make-icons.mjs`, `src/middleware.ts`, `next.config.mjs`, `src/app/layout.tsx` ·
Tests: `tests/unit/metrics-seller-policy.test.ts`, `tests/integration/push-pipeline.test.ts`, aangepaste `search`/`filters`-tests, e2e (PWA, filtertest, prestaties) · `scripts/benchmark.ts`.

## 3. Prisma-migratie
`20261011142112_pipeline_metrics_push` — **uitsluitend toevoegingen** (nieuwe kolommen/tabellen `PushSubscription`, `CheckRun`), geen data verloren. Wordt bij start automatisch toegepast (`prisma migrate deploy`).

## 4. Omgevingsvariabelen
| Variabele | Verplicht | Uitleg |
|---|---|---|
| `VAPID_SUBJECT` | aanbevolen | `mailto:…` of `https://…` contact voor de pushdiensten |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | nee | Weglaten ⇒ eenmalig gegenereerd en versleuteld in de database bewaard (web én worker delen ze). Zelf zetten kan: `npx web-push generate-vapid-keys`. **Wissel je later van sleutels, dan moeten apparaten opnieuw "inschakelen".** |
| `WORKER_INTERVAL_SECONDS` | nee | Idle-wachttijd worker (standaard 5) |

## 5. Web Push instellen
1. Deploy over **https** (Coolify doet dit). 2. (Optioneel) `VAPID_SUBJECT` zetten. 3. Open het portaal → Instellingen → Pushmeldingen → *Pushmeldingen inschakelen* → toestemming → *Stuur testpush*. 4. Zet bij Zoekopdrachten "Meldingen" aan en kies de drempel. Stap voor stap per toestel: `/install`.

## 6. Worker/scheduler op Coolify (belangrijk)
- Je bestaande `worker`-service (`npm run worker`) is de **primaire scheduler**; die moet draaien (1 instantie is genoeg; meerdere kunnen veilig samen, maar delen dan niet de 3 s-pacing).
- **Vercel-cron:** `vercel.json` bevat `0 6 * * *` — één keer per dag. Op Vercel Hobby zijn crons maximaal dagelijks; sneller (bijv. `*/5 * * * *`) kan alleen op Vercel Pro en blijft per aanroep beperkt tot ±50 s. Voor 5–10 minuten-detectie gebruik je dus de Coolify-worker; de Vercel-cron is alleen vangnet. Draai niet beide met hoge frequentie (dubbele requests naar de bron).
- Instellingen → Snelheid & controle-interval; per zoekprofiel kies je 5/10/15/… minuten.

## 7. Snelheid (gemeten) — zie ook Prestaties-pagina
Meting: `scripts/benchmark.ts` (5 profielen, 3 parallelle analyses, pushdienst nagebootst, testdatabase, sandbox-CPU):

| Scenario | Eerste detectie → volledige analyse (gem. / p95) | → push "verzonden" (gem. / p95) |
|---|---|---|
| 10 nieuwe advertenties tegelijk | 0,27 s / 0,33 s | 0,37 s / 0,39 s |
| 300 advertenties tegelijk (extreme piek; wachtrij) | 6,2 s / 7,2 s | 6,3 s / 7,4 s |

Echte Marktplaats-zoekpagina (1 steekproef via curl in de sandbox): ophalen 0,7–1,7 s, parsen 2–4 ms.

**Wat dit wél en niet zegt:** dit is *onze verwerkingstijd* nadat een advertentie is opgehaald. De werkelijke vertraging tussen plaatsing op Marktplaats en melding is:
`wachttijd tot volgende controle (≤ interval, gem. ½ interval)` + `paginafetch (≈1–2 s per pagina + 3 s pacing)` + `detailpagina (≈3–5 s per nieuwe advertentie door de 3 s-pacing)` + `analyse (<1 s) ` + `push (<1 s tot pushdienst; levering door Apple/Google varieert)`.
Bij interval 10 min is de **haalbare gemiddelde detectievertraging ≈ 5–6 minuten, worst case ≈ 10–11 minuten + enkele tot tientallen seconden** (afhankelijk van aantal nieuwe advertenties per controle). **Dat is geen realtime.** De "Prestaties"-pagina toont gemeten tijden en een expliciet als *schatting* gemarkeerde maximale detectievertraging.

## 8. Bekende beperkingen (eerlijk)
1. **Nieuwste-eerst sortering is niet toegestaan af te dwingen.** `SORT_INDEX` bestaat alleen als client-side URL-fragment of in de door robots.txt verboden API; de server geeft de standaardvolgorde (betaalde "dagtoppers" voorop). Nieuwe advertenties staan dus niet gegarandeerd op pagina 1. Mitigatie: specifieke zoektermen/categorieën, `maxPages` (standaard 3), meerdere profielen. Een geautoriseerde feed/partner-API van Marktplaats zou dit oplossen — **zonder die toestemming blijft er een kans dat een advertentie later wordt gezien.**
2. **Verkopersgegevens:** in toegestane zoekresultaten staan alleen `isVerified`, `sellerName` (vaak "Anoniem"), `sellerId` en een zakelijk-kenmerk. **Beoordelingen, accountleeftijd en verkoopverleden zijn niet beschikbaar** ⇒ altijd "Onbekend" en nooit als positief meegeteld. De score is dus bewust voorzichtig en een hulpmiddel, geen garantie.
3. **Publicatietijd** van Marktplaats is dagniveau ⇒ geen exacte "echte detectievertraging" meetbaar; we meten vanaf eerste detectie.
4. **Geen live test op een echte iPhone** vanuit deze omgeving (zie §10). iOS-push werkt alleen voor geïnstalleerde webapps (iOS 16.4+).
5. Push-bezorging na verzending door de pushdienst (Apple/Google) valt buiten onze controle; "verzonden" = door de dienst geaccepteerd.
6. Reiskosten/verzendkosten/batterijbeleid staan standaard **uit (0)** zodat bestaande berekeningen niet stilletjes veranderen — zet ze bewust aan.
7. Meerdere gelijktijdige processen (web-tick + worker) delen de 3 s-pacing niet; draai de Vercel-cron daarom niet snel naast de worker.

## 9. Nog ontbrekend voor gelijkwaardigheid met de huidige leverancier
- **De filterregels uit het Word-document van de klant** — dat document is niet aangeleverd; er is **niets overgenomen of aangenomen**. De engine is er klaar voor (flexibele velden, AND/OR, nesting, test-functie); de regels moeten functioneel worden vertaald zodra het document er is.
- Geautoriseerde/snellere databron (partner-API/feed) voor echte (near-)realtime detectie.
- Verkoper-historie (beoordelingen/leeftijd) indien Marktplaats dit toestaat/aanbiedt.
- Meer-bron-ondersteuning (alleen Marktplaats), lokale foto-analyse voor batterij-screenshots, rate-limit-adaptieve planning (backoff bij 429 is er; automatische intervalverlaging nog niet).
- Productie-ervaring/monitoring over weken (alerting bij uitval van de worker; nu zichtbaar als "achterstallig" op Prestaties).

## 10. Testen
- Automatisch: `npx vitest run` (379 tests: engines, filters, seller, beleid, prefs, push-API, pipeline, retries, dedupe, Telegram-alternatief, scrape-toegestane paden) en `npx playwright test` (14 scenario's incl. PWA-manifest/SW/offline, filtertest, prestaties, mobiel zonder horizontale scroll).
- **Door jou op een echte iPhone te doen** (kan ik hier niet): 1) Safari → open portaal (https) → Deel → *Zet op beginscherm*; 2) open via het icoon; 3) Instellingen → Pushmeldingen → inschakelen → *Sta toe*; 4) *Stuur testpush* → melding verschijnt, tik ⇒ app opent `/notifications`; 5) sluit de app volledig, maak een zoekprofiel met lage drempel, wacht op een echte melding ⇒ tik ⇒ opent de deal; 6) test Niet-storen/Focus en stilteperiode; 7) zet Wi-Fi uit ⇒ app toont offline-pagina (geen gegevens gecachet); 8) log uit/in: pushes bij uitgelogde sessie blijven per apparaat bestaan — verwijder het apparaat in Instellingen als je het toestel overdraagt.
- Controle toegestane bronbeperkingen: `tests/integration/search.test.ts` bewaakt dat alleen robots-toegestane paden worden gebruikt, dat 403/429 niet worden omzeild en dat de pacing blijft gelden.
