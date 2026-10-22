# Inkoopgebied op autorijtijd

De stand `policies.distance.mode=driving` selecteert op een berekende autoroute vanaf centrum Apeldoorn (52.2112, 5.9699). De productie-instelling voor deze release is maximaal 30 minuten, inclusief de grens van 1800 seconden. Kilometers blijven afzonderlijke broninformatie; er is geen omrekening van kilometers naar minuten.

Buiten die grens kwalificeert een advertentie alleen met expliciet beschikbare verzending, een gemiddelde verkopersbeoordeling van minimaal 5/5, minimaal 50 reviews, minimaal 24 maanden accountleeftijd en zonder uitsluitende risico-indicatoren. Dit betekent 50 reviews met gemiddelde 5/5, niet 50 afzonderlijke vijfsterrenreviews. Ontbrekende gegevens krijgen geen automatische goedkeuring. Betrouwbare verzending is een beleidslabel, geen garantie tegen fraude.

## Routering

De Compose-service `routing` bouwt een eigen OSRM-carrouter met Nederlandse OpenStreetMap-weggegevens via Geofabrik. Er is geen publiek routeringsendpoint en geen extra Marktplaats-request voor een route nodig. De openbare OSRM-demo is wegens zijn beleid voor niet-commercieel gebruik niet geschikt voor deze toepassing: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server . Bron: https://download.geofabrik.de/europe/netherlands.html . Attribution: © OpenStreetMap contributors (ODbL), Geofabrik en OSRM (BSD-2-Clause).

Een nieuw kaartbestand wordt tijdens de bouw op MD5 gecontroleerd. `MAP_REFRESH` vernieuwt de Docker-cache bewust; bij een kaartupdate moet ook `ROUTE_VERSION` veranderen. De download is circa 1,3 GB; tijdens lokale bouw was de hoogste door OSRM gerapporteerde RAM-piek 3,17 GB. De draaiende router gebruikte lokaal circa 885 MiB en krijgt 1536 MiB limiet plus één CPU. Niet publiek publiceren; alleen web/worker gebruiken `ROUTING_URL=http://routing:5000`.

Rijtijden zijn schattingen zonder actuele verkeersinformatie. Marktplaats-coördinaten kunnen op een plaatscentrum slaan. Er wordt geen exacte verkoperslocatie of gegarandeerde reisduur gesuggereerd. Een weg op meer dan 1000 meter van een broncoördinaat, ontbrekende coördinaten of een ongeldige route leidt tot onbekend. Kaartdekking: Nederland; een niet gevonden route wordt niet vervangen door een fictieve afstand of rijtijd.

## Verwerking en herstel

Broncoördinaten blijven in de opgeslagen bronattributen. `ROUTE_AD` heeft een eigen workerbaan. Routes worden per coördinaat/version maximaal zeven dagen gedeeld, met een database-lock tegen dubbele aanvragen. Een gewijzigde locatie maakt de oude route onmiddellijk ongeldig. Mislukte routejobs gebruiken de bestaande retry/backoff; de zoekworker blijft doorzoeken. Bij herstel volgt snelle herbeoordeling, met behoud van advertentie-/gebruikersdeduplicatie. Een gewijzigde verkopersbeoordeling of verzendoptie kan ook zonder gewijzigde advertentietekst tot herbeoordeling leiden.

Het hoofdscherm, de standaard dealfilterlijst, de profielmatching, bestaande wachtende pushmeldingen en de popupfeed volgen het actuele beleid. `Handmatig beoordelen` blijft bereikbaar via de dealfilters (`/deals?review=1`); er wordt geen historie verwijderd. Het statusscherm toont de laatst vastgelegde geslaagde of mislukte route, zonder dat het openen van het scherm een bronrequest veroorzaakt. De beveiligde operatorstatus vermeldt beleid en routegegevens.

## Reproduceerbare verificatie

Gebruik uitsluitend een geïsoleerde testdatabase voor de tests (ze wissen testtabellen):

```sh
npm run lint
npm test
npm run build
npm run test:e2e
```

`tests/integration/driving-policy.test.ts` controleert de grens van 1800/1801 seconden, de drie verkopersdrempels, onbekende gegevens, routefouten en herstel, caching, locatieverandering, melding na routering en bestaande meldingen/popups buiten het gebied. De browsertest controleert de ingestelde 30 minuten en de rijtijdtekst op de mobiele feed. Fixtures bestaan alleen in testdatabases.

Lokale echte routeringsmetingen van 22 oktober 2026: Deventer 1319,2 seconden; Zutphen 1697,1; Zwolle 2028,7; Amersfoort 2592,8; Rotterdam 6153,3. Deze routes tussen plaatscentra bepalen geen algemene gemeentelijke grens. Een routeaanvraag duurde lokaal 3–15 ms. Dit bewijst geen publicatie-tot-iPhoneprestatie; fysieke iPhone-ontvangst vereist een echte advertentietest.

## Uitrol en herstel

Voor de uitrol: herstelbaar PostgreSQL-backupbestand maken en de inhoudsopgave controleren. Het schema voegt alleen nullable routevelden plus een index toe. De oude plaats-teststand blijft actief tijdens de bouw. Pas nadat de nieuwe app, databasevelden én interne router werken wordt `cityOnly` leeggemaakt en het nieuwe beleid opgeslagen. De volledige vorige configuratie en profielen/regels blijven in een aparte AppSettings-back-up. Coolify blijft op de geteste releasecommit vastgezet, automatische uitrol uitgeschakeld.

Bij problemen kan de bewaarde configuratie worden hersteld; voor terugkeer naar de vorige app eerst de plaats-teststand `cityOnly=Apeldoorn` herstellen, daarna het oude image/commit activeren. De additive databasevelden kunnen blijven bestaan. Geen advertenties, profielen, aankopen of notificatiehistorie verwijderen.

Verificatie vóór uitrol: TypeScript geslaagd; 519 automatische tests in 36 bestanden geslaagd; productiebuild geslaagd; alle 17 browserscenario's geslaagd (16 in volledige run, de gecorrigeerde radartest afzonderlijk). In de bestaande fototest is de selectie vastgezet op de particuliere fixtureadvertentie; `findFirst` zonder filter koos soms de Admarkt-fixture, waarvoor de particuliere fotomaatcode niet geldt. Het activeringsscript is op de geïsoleerde testdatabase met de echte lokale router uitgevoerd; de route naar Deventer gaf 1319,2 seconden en de bestaande gegevens bleven bestaan.
