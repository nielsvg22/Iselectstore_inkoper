> Actuele aanvulling: [RECENTE-DETECTIE.md](RECENTE-DETECTIE.md) beschrijft de nu werkende openbare tijdvensterroute. Eerdere uitspraken hieronder over alleen brede historische pagina’s zijn voor de centrale recente radar achterhaald.

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

### Slim zoeken op model en opslag (snelle modus, zonder e-mail, binnen de regels)
Probleem (gemeten): bij een gewone zoekterm staan nieuwe advertenties verspreid over tientallen pagina's (iPhone 15 Pro: 2.215 resultaten). Marktplaats publiceert in zijn publieke categoriepagina's echter **filterpagina's per model en opslag** (`/l/<categorie>/f/256-gb+iphone-15-pro/12825+14053/`), niet verboden in robots.txt. Daardoor is de lijst veel smaller en volledig door te lopen.
- **Gemeten (live):** iPhone 15 Pro 256GB = 220 resultaten = 8 pagina's; volledige doorloop **220 van 220 gezien (100% dekking) in ±23 s** (3 s pauze per pagina).
- Werkt voor profielen in snelle modus waarvan het filter modellen (en eventueel opslag) bevat. Facetten worden automatisch uit de categoriepagina gelezen (24 uur gecachet). 26 van 30 catalogus-iPhones hebben een filterpagina; de rest (en iPad/MacBook, waar de categoriepagina geen filterlinks toont) loopt automatisch via de gewone zoekterm mee.
- **Vangnet:** advertenties zonder model-/opslagkenmerk staan niet in de filterpagina's; daarom wordt elke 10 minuten (instelbaar) in plaats daarvan de volledige zoekterm doorlopen.
- **Rekenvoorbeeld:** één slice van 8 pagina's per cyclus = 8 requests. Bij de standaardrem (6 pagina's/min) is dat ±1 cyclus per 80 s; 3 slices elke 2 minuten vragen ±12 requests/min (verhoog "Max. pagina-requests per minuut" bewust). Detectievertraging ≈ cyclusduur (≈ 25–60 s) + interval, dus **±1–2 minuten voor de gevolgde modellen**; niet-gevolgde modellen blijven op 5–15 minuten.

### iPhone-melder (één tik) en rondlopend crawlen
- **Zoekopdrachten → "Elke nieuwe iPhone melden → Aanzetten":** maakt profiel *iPhone-melder (alle iPhones)* (snelle modus, alle catalogus-iPhones × opslag 64–1024 GB als smalle lijsten, melding bij elke nieuwe advertentie, drempel 0) en zet de snelle modus globaal aan. Idempotent.
- **Per model ingedeeld:** er komt één zoekprofiel per iPhone-model (categorie "iPhone", 30 modellen + "overige modellen"), elk met eigen status, eigen smalle lijsten per opslag en eigen doelinterval (iPhone 13+ elke 3 min, overige 20 min). De scheduler pakt steeds het profiel met de grootste achterstand ten opzichte van zijn doelinterval, binnen de paginarem. Bij Zoekopdrachten staat de lijst onder "iPhone", onderverdeeld per generatie (iPhone 17, 16, 15 … SE, Overige), met per generatie en voor alles samen "Pauzeren / Aanzetten". Bewerken van zo'n profiel behoudt de model-instellingen.
- **Automatisch op de server:** de worker maakt deze profielen bij de eerste start na de uitrol zelf aan (zodra er een beheerder is), zet de snelle modus aan en verhoogt de paginarem eenmalig van 6 naar 12/min (alleen als die nog op de standaard stond). Gebeurt één keer; verwijder of pauzeer je het profiel, dan komt het niet vanzelf terug (de knop kan het wel opnieuw aanmaken).
- **Rondlopend:** elke controle pakt maximaal *Pagina's per controle* (standaard 12) aan smalle lijsten: eerst wat nog nooit is bekeken, daarna de grootste achterstand t.o.v. het doelinterval (prioriteit: iPhone 13 en nieuwer 3 min, overige 20 min). Zo blijft de belasting begrensd; alleen de rondetijd hangt af van het aantal lijsten. *Prestaties* toont de geschatte rondetijden.
- **Echte aantallen (live, 2026-10-11):** alle iPhone-modelfacetten samen 16.385 advertenties = ±546 pagina's; iPhone 13 en nieuwer 9.963 = ±332 pagina's. Bij 12 pagina's/min is een ronde langs iPhone 13+ dus **±28 minuten**, langs alles ±46 minuten; bij 24/min de helft. **"Elke nieuwe iPhone binnen 2 minuten" is met alleen publieke pagina's niet haalbaar**; een gekozen handvol modellen (bijv. 1–3 lijsten) wel (±1–2 min).

### Mailbox-koppeling (Marktplaats-zoekalerts)
Waarom: via de toegestane zoekpagina's zijn nieuwe advertenties niet betrouwbaar te vinden (gemeten: "Vandaag"-advertenties staan verspreid over pagina 1–20+). De zoekalerts die Marktplaats zelf per mail stuurt wél snel. Alles draait in de app/worker:
1. **Instellingen → Mailbox:** IMAP-server, poort (TLS, certificaat wordt gecontroleerd), gebruiker, **app-wachtwoord** (versleuteld opgeslagen, nooit zichtbaar), map, afzenderfilter ("marktplaats"), interval (standaard 20 s, min. 10 s). *Test verbinding* toont de laatste Marktplaats-mails en hoeveel advertentielinks eruit gehaald worden.
2. De worker leest **alleen-lezen** (er wordt niets gemarkeerd, verplaatst of verwijderd). Eerste keer = nulmeting: oude mails worden **nooit** verwerkt (ook niet na een UIDVALIDITY-wijziging).
3. Per nieuwe alert-mail: advertentielinks herkennen (ook in tracking-links verpakt), de advertentiepagina ophalen (één gewone pagina per nieuwe advertentie, met robots.txt-controle, pacing en SSRF-bescherming), opslaan, analyseren, matchen en pushen. De worker wordt direct wakker gemaakt (geen wachttijd).
4. Profiel met **"Alleen via mailbox"**: wordt niet zelf gezocht; jouw filters (model, minimale winst, afstand, …) bepalen of een alert-advertentie een push geeft. Advertenties uit het zoeken laten zo'n profiel niet pushen.
5. Dedupe: dezelfde advertentie via mail én zoeken geeft één melding (zelfde `externalId` en `dedupeKey`).
- **Getest** tegen een echte (lokale) IMAP-server met TLS (Dovecot): nulmeting, nieuwe mail in ±30 ms gezien, verkeerd wachtwoord/map/onbetrouwbaar certificaat geven een begrijpelijke melding, en het proces blijft draaien (`scripts/imap-smoke.ts`). **Niet getest** tegen Gmail/Outlook/iCloud en niet met een echte Marktplaats-alertmail (het exacte mailformaat kon ik niet inzien); de link-herkenning is daarom ruim opgezet en *Test verbinding* laat zien wat er herkend wordt.
- **Snelheid:** wachttijd = tijd tot Marktplaats de mail verstuurt (buiten onze controle) + ≤ interval (gem. 10 s) + ±1–3 s ophalen/analyseren/pushen.

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

## In-app pop-up per nieuwe advertentie

Elke nieuwe advertentie die een profiel matcht (na nulmeting, binnen versheidsvenster, voorkeuren van de gebruiker) maakt een `INAPP`-melding.
De geopende app pollt `/api/notify/feed` elke 5 s en toont een pop-up-kaart (model, prijs, marktwaarde, winst, score, afstand, knoppen naar de deal en Marktplaats).
Uitzetten kan bij Meldingen → "Pop-up in de app" (`popup`). INAPP-meldingen tellen niet mee in de verzendstatistieken. Werkt alleen terwijl de app open staat; voor gesloten app blijft Web Push nodig.
