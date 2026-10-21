# Bronstatus en tijdelijke Apeldoorn-teststand

## Statusscherm

De bestaande `/status`-pagina toont nu expliciet de Marktplaats-toegang:

- `Zoeken werkt`: recente geslaagde zoekcontrole en geen actieve bronpauze.
- `Requestlimiet bereikt`: waargenomen HTTP 429.
- `Toegang geweigerd`: waargenomen HTTP 403; dit bewijst geen IP-ban.
- `Autorisatie vereist`: officiële API weigert het eigen OAuth-token met 401.
- `Botcontrole ontvangen`: een herkenbare CAPTCHA/robotcontrole; ophalen stopt.
- `Herstel nog niet bevestigd`: de pauze is voorbij, maar nog geen geslaagde
  zoekcontrole ná de pauze. Het verlopen van een timer maakt de bron niet groen.
- Afzonderlijk: uitgeschakeld, API niet ingesteld, geen actief profiel,
  geen eerdere controle, verouderde controle en gewone bronstoring.

De pagina toont heartbeat, laatste zoeksucces, laatste fout-/pauzesignaal,
vroegste herprobeertijd en het ingestelde requestbudget. Een actieve gedeelde
403/429-pauze heeft voorrang op een eerdere geslaagde zoekronde; ook weigeringen
op robots.txt of een detailpagina worden zo zichtbaar. Een botcontrole met
HTTP 200 wordt geregistreerd en geeft een bronpauze. Een timeout of onleesbare
pagina wordt niet als bewezen IP-ban gepresenteerd.

Het scherm vernieuwt elke 15 seconden wanneer het zichtbaar is, en bij terugkeer
naar de app. Het leest uitsluitend opgeslagen databasegegevens: openen of
verversen veroorzaakt geen extra Marktplaats-requests. De bestaande
operationele bearer-route `/api/jobs/status` bevat dezelfde beperkte gegevens
onder `sourceAccess`. OAuth-tokens en fingerprints worden niet teruggegeven.
De oudere prestatiepagina noemt een bronpauze niet langer een bewezen blokkade.

## Alleen de plaats Apeldoorn

De eigenaar beperkte de test eerst tot 10 km en corrigeerde dit vervolgens naar
**uitsluitend de plaats Apeldoorn, zonder verzending van buiten**. Daarom wordt
een exacte plaatsnaam toegepast; dit is geen straal van 10 km.

`radar.cityOnly = "Apeldoorn"` geeft deze beperking. In Instellingen staat de
schakelaar **Teststand: alleen plaats Apeldoorn**. Uitschakelen zet de waarde op
een lege string en herstelt de bredere detectie met de bestaande profielregels.
Het wijzigt geen andere instellingen en verwijdert geen opgeslagen advertenties.

- Zoekresultaten met een andere/onbekende plaats worden niet nieuw opgeslagen.
- Profielmatching past de beperking ook toe bij import en heranalyse.
- Pushverzending controleert de actuele instelling opnieuw, zodat wachtende
  meldingen van buiten Apeldoorn worden overgeslagen.
- De hoofdfeed, kerncijfers en pop-upfeed tonen alleen Apeldoorn in deze stand.
- `Ugchelen`, `Beekbergen`, `Omgeving Apeldoorn` en onbekende plaatsen komen niet
  door, ook niet bij een korte afstand of aangeboden verzending.
- De bronplaats blijft broninformatie, geen adresverificatie of verzonnen afstand.
  Bestaande historie en inkoopgegevens blijven behouden.

De openbare zoekrequests blijven breed en respecteren hetzelfde gedeelde
requestbudget. De plaatsbeperking wordt lokaal afgedwongen; we claimen geen
onbewezen server-side Marktplaats-locatiefilter. Daardoor vermindert deze
teststand meldingsdruk, niet vanzelf het aantal zoekrequests.

## Veilige configuratie-overgang

Op 21 oktober is de lopende radar alvast via de bestaande profielregelboom
beperkt tot `location eq Apeldoorn`. De oorspronkelijke configuratie, actieve
profielen en regels zijn opgeslagen in
`AppSettings["backup:apeldoorn-city-only:20261021"]`. Er is eerst een volledige
PostgreSQL-dump gemaakt en met `pg_restore --list` gecontroleerd:
`/var/lib/postgresql/data/iselect-backups/pre-apeldoorn-only-20261021.dump`.

De tijdelijke extra regel heeft een herkenbare
`temporary-apeldoorn-only-`-ID. Bij de release is uitsluitend deze door ons
toegevoegde regel verwijderd, nadat de nieuwe code en
`radar.cityOnly = "Apeldoorn"` zijn bevestigd. De oorspronkelijke profielregels
blijven staan. Zo kan de schakelaar later de teststand weer werkelijk uitzetten.
Voor deze release is geen database-schemamigratie nodig.

## Reproduceerbare verificatie

```bash
npm run lint
npm test
npx vitest run tests/integration/source-monitor.test.ts tests/integration/city-scope.test.ts
npm run build
npm run test:e2e
```

De volledige suite is geslaagd met 500 tests in 35 bestanden. Daarna zijn de
aanvullende gevallen ook afzonderlijk geslaagd: de bronmonitorsuite heeft
7 tests en de stadssuite 4 tests, inclusief één lokale melding zonder doublure.
TypeScript en de productiebuild zijn geslaagd. Alle 17 browsertests zijn
geslaagd, inclusief automatisch herstel na een nagebootste 403, mobiele
weergave, de instellingsschakelaar en uitsluiting van niet-Apeldoorn in de feed.
De nieuwe schermen zijn gecontroleerd met de React-richtlijnen: server-side
dataverzameling, beperkte gegevensoverdracht, gekoppelde labels en één bestaande
verversingscomponent met opruimen van timers en listeners.

Alle nagebootste blokkades en advertenties bevinden zich uitsluitend in de
afzonderlijke lokale testdatabases. Een echte IP-ban wordt niet uitgelokt en
deze tests bewijzen geen ontvangst op een fysieke iPhone.

## Gecontroleerde productie-uitrol

Codecommit `e0697979108af70a58dc446dd02fd508c2d6189b` is gepusht naar
`feature/source-access-status` en op **21 oktober 2026 om 16:22:16
Europe/Amsterdam** uitgerold op https://deals.85.190.105.138.nip.io.
Coolify-deployment: `yn5l8jrvg6lgm5gbo40p81lh`.

Vooraf is opnieuw een volledige, met `pg_restore --list` gecontroleerde dump
gemaakt: **20.672.617 bytes**, op
`/var/lib/postgresql/data/iselect-backups/pre-status-city-e0697979108a.dump`.
De databasevolume-identiteit en alle omgevingsvariabelen zijn behouden.
De vroege nameting toont 9.748 advertenties tegenover 9.734 vóór de build:
de oude worker heeft tijdens het bouwen nog verwerkt. Het bestaande
inkooprecord, 35 profielen en de 73 oorspronkelijke regels bleven behouden.
De tijdelijke Apeldoorn-regel is verwijderd; de expliciete configuratie
`radar.cityOnly = "Apeldoorn"` is bevestigd en de configuratieback-up bestaat.

De nieuwe webcode geeft de toegangsmonitor terug via de afgeschermde
operationele route. Na de containerwissel zijn nieuwe echte zoekrondes
geslaagd, met actuele heartbeat en bronstatus `Zoeken werkt`. Tijdens de
eerste twee afgeronde rondes werden elk twintig bronresultaten verwerkt;
er werden **geen nieuwe advertenties toegevoegd**. Dit is een beperkte echte
nameting, geen geïmporteerde demonstratie of bewezen iPhone-ontvangst.
In de latere vijf-rondesteekproef is wel één nieuwe advertentie door de
Apeldoorn-teststand gekomen: `m2456286390`, gedetecteerd om 16:24:01,167 lokale
tijd. De pushdienst accepteerde de melding om 16:24:02,381, **1,214 seconde na
detectie**. Dit bevestigt de echte meldingsketen met de beperking aan; zichtbare
ontvangst op de telefoon is hiermee nog niet bevestigd.

De tijdelijke deploymenthooks zijn verwijderd en automatische deployments
blijven uit. De app is vastgezet op de geteste codecommit; het pushen van
latere meetdocumentatie rolt geen nieuwe versie uit. Voor terugrollen naar de
oude code moet de tijdelijke plaatsregel opnieuw worden toegevoegd: de oude
code kent de nieuwe `cityOnly`-instelling niet.

Zie [de beperkte live meetgegevens](evidence/source-status-production-2026-10-21.json).
