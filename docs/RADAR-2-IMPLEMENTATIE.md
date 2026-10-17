# iSelectStore Inkoopradar — wijziging en verificatie

Branch: `feature/deal-hunter-2`, gebaseerd op `00ca13b` van de actuele standaardbranch `claude/apple-deal-hunter`. De experimentele branch `feature/apeldoorn-deal-radar` (`01c041d`) is vergeleken en deels hergebruikt na correctie van de verwijderende profielmigratie en te strenge detectiefilters. Bij aanvang was de nieuwe checkout schoon; beide remote branches en hun commitgeschiedenis zijn gecontroleerd. Geen andere repository of Shopify-winkel is aangepast.

## Architectuur en gevonden vertraging

Next.js 15/React 19, PostgreSQL/Prisma, een persistente databasewachtrij met `SKIP LOCKED`, een afzonderlijke Node-worker, publieke Marktplaats HTML-adapters, optionele AI, marktvergelijkingen, inkoopadministratie en PWA/Web Push bestaan al. Deze onderdelen zijn behouden. De historische README beschreef push ten onrechte als ontbrekend.

De cron draait volgens `vercel.json` dagelijks; een externe vijfminutencron wordt in de oude README aanbevolen. De eerdere tick wachtte op de netwerkrij terwijl de andere rij al leeg kon zijn. Bovendien liep AI vóór de eerste melding, werd een hele zoekronde vóór ingest afgewacht, en hadden voorlopige en volledige pushes verschillende deduplicatiesleutels.

Nu hebben zoeken/details, analyse en notificaties zelfstandige worker-lussen. Paginaresultaten worden direct opgeslagen. De eerste analyse van lijstgegevens gebruikt alleen regels en marktdata; AI en details volgen later. Notificatie en verzendjob worden atomair opgeslagen. Voorlopige en volledige analyses gebruiken één pushsleutel; een bestaande oude voorlopige sleutel wordt ook gerespecteerd. Een retry na een onzekere netwerkafbreking kan principieel opnieuw verzenden; de stabiele notification-tag beperkt dubbele weergave, maar exactly-once-bezorging bij Apple wordt niet geclaimd.

## Zoekprofielen en gegevensbehoud

Het eerste starten van de nieuwe worker migreert eenmalig de profielen van de oudste beheerder naar **iSelectStore — Smart Inkoopradar**. De beheerder kan dit ook bij Zoekopdrachten starten. Vóór archivering worden profielinstellingen, regels, notificatievoorkeuren en een configuratiesnapshot als JSON in AppSettings opgeslagen. Bestaande records blijven bestaan: advertenties, aankopen, regels, matches en notificatiehistorie worden niet gecascadeerd verwijderd. Pending meldingen van gearchiveerde profielen worden overgeslagen. Bestaande opgeslagen filters worden niet overschreven.

Back-ups downloaden en profielactivering herstellen kan via Zoekopdrachten → Profielback-ups en herstel. Herstel heractiveert de oorspronkelijke profielrecords, herstelt de oorspronkelijke meldingsselectie en pauzeert de radar. Globale instellingen worden niet blind teruggezet; hun snapshot staat in de download. Nieuwe profielen of latere handmatige wijzigingen buiten deze records worden niet verwijderd.

De worker maakt na die eenmalige migratie niet opnieuw oude modelprofielen aan. Gepauzeerde en gearchiveerde profielen staan buiten het actieve overzicht, maar blijven toegankelijk. Geplande cleanup verwijdert geen advertenties meer. De afstandsmigratie bewaart oude, niet aan Apeldoorn gerelateerde afstanden in `rawPayload.legacyDistanceKm` en zet het actieve afstandsveld op onbekend.

## Detectie versus selectie

De radar heeft geen minimale winst-, batterij- of scoredrempel voor brede detectie. Regels voor relevante productfamilies en harde risicoblokkades blijven gelden. Presets: Alle nieuwe kansen, Topdeals (€75/80 en voldoende onderbouwde waardering), Veilig verzenden (bronreviews/accountleeftijd/verzending/afstand vereist). Presets zijn bewerkbaar via Mijn filters. De dashboarddrempels en verkopersdrempels staan in Instellingen → beleid. Een eigen filter kan een onbekende waarde expliciet toestaan of afwijzen; een strikte afstandsfilter laat onbekende afstanden niet meer stilzwijgend door.

Eén zichtbaar profiel gebruikt brede zoekwoorden (iPhone eerst) en de bestaande rondlopende model-/opslagslices. De normale smalle ronde heeft maximaal twee slices plus een brede iPhone-vangnetquery en één roulerende andere Apple-familie. Periodiek volgt het volledige brede vangnet. Dit beperkt verzoeken en behoudt Pro/Max/Plus/opslagdekking zonder tientallen zichtbare profielen. De dekking van opgehaalde pagina's is nadrukkelijk niet de dekking van alle nieuwe advertenties.

## Werkelijk gecontroleerde bronbeperkingen (2026-10-17)

Twee publieke zoekpagina's en robots.txt zijn read-only opgehaald met HTTP 200. De eigen parser las 30 advertenties uit de actuele respons (48.296 totale resultaten); alle 30 bevatten bruikbare coördinaten, nul bevatten rating/reviewaantal/accountleeftijd. Deze broncontrole was read-only en heeft geen advertenties in productie geïmporteerd. Afstanden worden met de haversineformule vanaf Apeldoorn (52.2112, 5.9699) berekend. Dat is hemelsbreed vanaf het centrum, geen rijafstand. Namen worden niet gegokt of gegeocodeerd; ontbrekende coördinaten betekenen onbekende afstand.

De verkoperrespons bevatte `sellerId`, `sellerName`, `showSoiUrl`, `showWebsiteUrl`, `isVerified`. Geen rating, reviewaantal of accountleeftijd. Die blijven onbekend. Een profiel-URL is geen bewijs voor een zakelijke verkoper. De parser leest numerieke review-/accountgegevens alleen wanneer ze werkelijk in de bron aanwezig zijn; er is geen verzonnen verrijking of AI-vertrouwenslabel. Buiten de lokale radius wordt alleen betrouwbaar verzenden gelabeld als alle instelbare bronvoorwaarden zijn bewezen en geen duidelijke risico's bestaan; anders handmatige beoordeling.

De server negeerde `?sortBy=SORT_INDEX&sortOrder=DECREASING`. Publieke HTML biedt daarmee geen bewezen nieuwste-eerst-sortering. Eerste pagina's kunnen betaalde en oudere advertenties bevatten. Daarom is **niet** bewezen dat ieder nieuw aanbod wordt ontdekt; een toestemminghoudende feed/partnerbron is nodig voor aantoonbaar volledige, snelle dekking. Verboden API's en CAPTCHA-omzeiling worden niet gebruikt. Marktwaardering blijft een schatting op basis van bestaande vergelijkingen; vraagprijzen zijn geen gerealiseerde verkopen.

Het doelinterval is 60 seconden, instelbaar vanaf 30 seconden. Werkelijke rondeduur, requestbudget, beschikbaarheid, bronvolgorde en wachtrij bepalen de uitkomst. De gedeelde database-pacing geldt ook voor web/cron/details, met minstens 3 seconden tussen requests en de ingestelde minuutlimiet. HTTP 403/429 activeert de bestaande oplopende bronpauze. Een niet beschikbare robots.txt stelt het ophalen uit.

## Hosting en productie

Docker Compose bevat web, Postgres met volume en een permanente worker met restartbeleid. De worker heeft nu een database-heartbeat en een healthcheck; een onhealthy container wordt door Docker zelf niet automatisch herstart: Coolify/extern toezicht moet dat beleid instellen. Een gecrashte worker herstart via `unless-stopped`; oude jobs worden hersteld. `/performance` toont liveness, broncontroles, foutmeldingen, wachtrijen, verzendresultaten en een advertentietijdlijn.

GitHub rapporteert bestaande succesvolle Vercel Production- en Preview-deployments; de productiecommit is `00ca13b` (2026-10-11). De bestaande site `https://apple-deal-hunter.vercel.app/api/health` gaf tijdens deze sessie HTTP 200 met `{"ok":true,"db":true}`. Dit bewijst bereikbaarheid van web en database, niet dat een VPS-worker draait. Na de implementatie gaf de eigenaar Coolify-toegang en expliciete deploymenttoestemming. Coolify 4.4.6 toont de juiste Docker Compose-app `apple-deal-hunter` op de standaardbranch, met web, worker en PostgreSQL. De bestaande workerlogs laten actieve planning/verwerking zien. De site `https://deals.85.190.105.138.nip.io/api/health` gaf HTTP 200 met werkende database. De uitrol wordt afzonderlijk gecontroleerd en hieronder vastgelegd. De Vercel-build voert geen migraties meer uit: voer migraties uitsluitend tegen de bedoelde database uit als afzonderlijke release-stap. Coolify voert ze bij de geautoriseerde servicestart uit.

Publicatiedata van zoekresultaten zijn dagindicaties; zij mogen niet als exacte detectielatentie worden gebruikt. `firstSeenAt` is eigen detectie, `prefilteredAt` eigen verwerking, `analyzedAt` volledige analyse, `Notification.sentAt` acceptatie door de pushdienst. Dit is geen ontvangstbewijs van de iPhone. Exacte publicatietijd uit detaildata wordt behouden als die daadwerkelijk beschikbaar is.

## Reproduceerbaar lokaal testen

Gebruik uitsluitend geïsoleerde testdatabases. De integratietests legen hun database.

```sh
npm ci
# PostgreSQL 16, gebruiker/wachtwoord dealhunter; maak dealhunter_test en dealhunter_e2e aan.
npm run lint        # bestaand lint-script is TypeScript tsc --noEmit; geen afzonderlijke ESLint-config
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`TEST_DATABASE_URL` en `E2E_DATABASE_URL` kunnen naar eigen geïsoleerde databases wijzen. Playwright start de gebouwde app op poort 3100. Nieuwe tests controleren afstand/provenance, onbekende verkopergegevens, archivering/herstel, deduplicatie, 50 advertenties met elk één verzendjob, concurrente requestreserveringen, zichtbaarheid vóór volledige analyse, opslaan, links en mobiele overflow. Browserdata is uitsluitend herkenbare E2E-fixturedata in de testdatabase.

De worker-smoketest is uitgevoerd op een derde lege lokale database: migraties toepassen, `npm run worker`, `npx tsx scripts/worker-health.ts`, vervolgens SIGTERM. De heartbeat slaagde en het proces eindigde met exitcode 0 in ongeveer 0,44 s. Dit bewijst lokaal opstarten/stoppen, niet productie-uptime of herstel na een echte VPS-storing.

## Nog echt te verifiëren

- Bronvoorwaarden/toestemming, publicatievolgorde en pagina-dekking; meet nieuwe echte advertenties over langere tijd. Geen garantie van 60 seconden.
- Toegestane bron voor reviews/accountleeftijd; tot die tijd geen automatische externe verzendgoedkeuring bij ontbrekende data.
- VPS/Coolify: branch, migratie, workerlogs, heartbeat, HTTPS en lokale databaseback-up zijn bij onderstaande uitrol gecontroleerd. Langdurige uptime, echte uitvalherstelproeven en maximale capaciteit vragen vervolgmetingen; een back-up buiten dezelfde VPS blijft gewenst.
- iPhone met iOS 16.4+: Safari → Deel → Zet op beginscherm → app openen → meldingen toestaan → echte testpush → sluiten → echte melding ontvangen → juiste advertentie openen. Controleer Focus en batterijbeleid.
- Realistische marktwaardes en kosten blijven afhankelijk van eigen verkopen/vergelijkingen en ingevulde reparatie-/verzendkosten.


## Afgeronde controles vóór deployment

- `npm run lint` / TypeScript: geslaagd.
- `npm test`: **423 geslaagd**, 26 testbestanden; geen overgeslagen integraties.
- `npm run build`: geslaagd, inclusief typecontrole en alle 37 statische routes.
- `npm run test:e2e`: **16 geslaagd**, inclusief mobiele overflow op 12 app-pagina's, PWA, directe links, administratie, filters en back-upinterface.
- Worker-smoketest: heartbeat gezond; SIGTERM exit 0, circa 0,44 s.
- Actuele publieke Marktplaats-HTML: 30 advertenties correct geparseerd, 30 met berekende Apeldoorn-afstand, 0 met reviews/accountleeftijd. Geen productie-ingest uitgevoerd tijdens deze controle.

Bij de browsertests zijn een te brede heranalyseknop en testisolatie rond demomodus gecorrigeerd. De test accepteert de echte headless-browsermelding dat notificaties geblokkeerd zijn; zij claimt geen echte iPhone-bezorging. De gesimuleerde pushdienst is apart in integratietests getest.


## Geautoriseerde productie-uitrol op Coolify

De eigenaar gaf tijdens de sessie expliciet toestemming om te deployen. Op 2026-10-17 om 06:03:18 UTC heeft Coolify deployment `yfhcga7uxfvpqdynqwmk6saq` succesvol afgerond voor codecommit `d9cefa3c8d69a0f3fcd2e83bbe2144b7b3d6fca2`, branch `feature/deal-hunter-2`.

**Live app:** https://deals.85.190.105.138.nip.io

Er is alleen aan de bestaande Coolify-app voor deze repository gewerkt. De Vercel-productiesite en andere repositories/services zijn niet uitgerold of aangepast.

Voor de build draaide in de bestaande PostgreSQL-container een volledige `pg_dump -Fc`, waarvan de archive-inhoud met `pg_restore --list` is gecontroleerd. De back-up staat op het bestaande databasevolume:

`/var/lib/postgresql/data/iselect-backups/pre-radar-v2-d9cefa3c8d69.dump`

Grootte: **11.442.706 bytes**. Het volume `haonfhb2akz6mysfscxffkso_dbdata` en zijn Coolify-storage zijn behouden. Dit is een herstelkopie op dezelfde VPS, geen externe disaster-recovery-back-up.

| Controle | Vóór | Na uitrol |
| --- | ---: | ---: |
| Advertenties | 5.679 | 5.680 |
| Inkooprecords | 1 | 1 |
| Profielrecords | 34 | 35 |
| Profielregels | 70 | 73 |
| Actieve centrale radar | — | 1 |
| Herstelbare profielback-ups | — | 1 |

De 34 oorspronkelijke profielen en 70 regels blijven bewaard; de nieuwe radar voegt één profiel en drie regels toe. Database-migraties zijn succesvol toegepast. De worker-healthcheck is aanwezig in de daadwerkelijke Compose-configuratie; de productie-heartbeat was gezond (`2026-10-17T06:03:18.078Z`). De publieke healthcheck gaf na de uitrol HTTP 200 met `{"ok":true,"db":true}`. De workerlogs tonen controles om 06:03:23 en 06:04:23 UTC; dat is planning op circa 60 seconden, geen gemeten publicatie-tot-push-latentie.

Eén detailrequest kreeg HTTP 500 van de bron en werd volgens de retrylogica opnieuw ingepland. Er is geen blokkade omzeild. De database-, sessie- en VAPID-/pushcredentials zijn bytegelijk gebleven. De tijdelijke pre-/post-deploymentcommando's worden na verificatie verwijderd en de oorspronkelijke automatische-deployinstelling wordt hersteld. De app blijft de featurebranch volgen.

Echte ontvangst op een iPhone en volledige brondekking binnen 60 seconden zijn ook na deze geslaagde uitrol **niet** geverifieerd.

## Vervolg: vertraging uit de detectieketen

De productie-worker plande vóór deze aanpassing zoekcontroles ongeveer elke 65 seconden. Detailrequests en zoekcontroles deelden één loper; snelle en volledige analyses deelden eveneens capaciteit. Daardoor kon een al lopende detailrequest of langzame AI-analyse nieuwe detectie en voorlopige meldingen ophouden.

De permanente worker en de tick-runner gebruiken nu afzonderlijke lopers voor detectie, details/facetten, snelle analyse, volledige analyse en push. De bestaande `ANALYZE_AD`-jobs blijven compatibel: `payload.quick === true` krijgt eigen capaciteit. De gedeelde database-pacing reserveert alleen een direct beschikbaar requestslot. Detail- en facetrequests wachten zolang een zoekcontrole klaarstaat of draait; zij kunnen geen toekomstige slots vooraf bezetten. De ingestelde gezamenlijke requestlimiet, robots-controle en blokkadepauzes blijven gehandhaafd.

Een centrale radarronde haalt maximaal twee zoekpagina's op: eerst de brede iPhone-zoekterm (of de gekozen hoofdzoekterm), daarna één roterende productfamilie of modelslice. Facetplanning leest uitsluitend de databasecache; verversen gebeurt via een achtergrondjob. Resultaten van de eerste pagina worden meteen opgeslagen en snel geanalyseerd. Er wordt geen AI voor de voorlopige beoordeling aangeroepen. Voor deze snelle rondes blijft de paginacache maximaal 15 seconden oud.

Nieuwe centrale radars krijgen een doelinterval van 30 seconden. Bij bestaande centrale radars wordt het eerdere standaardinterval van 60 seconden eenmalig naar 30 gezet. De oorspronkelijke configuratie blijft bewaard in `AppSettings[provision:radar-fast-polling-v1].before`. Afwijkende intervallen, uitgeschakelde snelle modus, requestlimieten, advertenties en gebruikersinstellingen blijven behouden. De scheduler controleert elke seconde of werk verschuldigd is; de heartbeat wordt elke tien seconden vernieuwd. De zichtbare dashboardfeed ververst elke vijf seconden en bij terugkeer naar het venster.

Reproduceerbaar: `npm test -- tests/integration/instant.test.ts` controleert wachtrij-isolatie bij vastgelopen taken, atomaire prioriteit/pacing, maximaal twee zoekpagina's, brede detectie vóór modelslices, koude facetcache, 30-secondenplanning en de herstelbare eenmalige instelling. De bestaande `fast-mode.test.ts` controleert bron → ingest → voorlopige push met nagebootste bron/pushdienst. Dat bewijst eigen verwerking, geen ontvangst op een iPhone of volledige detectie vanaf publicatie.

Deze keuze geeft brede iPhone-detectie voorrang. Andere productfamilies en modelslices roteren langzamer; één pagina per zoekeenheid betekent geen volledige dekking van grote resultaatlijsten. Marktplaats kan advertenties later of in een andere volgorde in publieke zoekpagina's tonen. Een doelinterval van 30 seconden is daarom geen garantie van directe publicatie-tot-push-bezorging.

Actieve jobs vernieuwen hun databaselease elke tien seconden. Verlaten claims worden na één minuut herstelbaar in plaats van na tien minuten. Het claimnummer (`attempts`) beschermt leasevernieuwing, afronding en foutregistratie tegen late updates van een oudere claim. Een afzonderlijke snelle analyseloper reserveert capaciteit binnen de ingestelde analyseconcurrency (bij concurrency 1 zijn twee lopers nodig om beide fasen onafhankelijk te houden). De Compose-worker krijgt 90 seconden om een lopende bronrequest/zoekronde bij een gecontroleerde stop af te ronden. Nieuwe tests controleren leasevernieuwing en herstel inclusief verouderde claims.

Validatie van deze versnelling: `npm run lint` geslaagd; `npm test` **432 geslaagd** in 27 bestanden; `npm run build` geslaagd; `npm run test:e2e` **16 geslaagd**. Een echte lokale worker op een afzonderlijke lege testdatabase vernieuwde zijn heartbeat en stopte met SIGTERM met exitcode 0 in 0,53 seconde. De bron- en pushketentest gebruikt nagebootste diensten en bewijst geen iPhone-ontvangst.
