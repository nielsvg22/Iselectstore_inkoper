# Recente Marktplaats-detectie via openbare HTML

Op 18 oktober 2026 is een werkende openbare datumroute gevonden en live getest:

```
https://www.marktplaats.nl/q/iphone/ta/offeredSince/{unix-milliseconden}/
https://www.marktplaats.nl/q/iphone/ta/offeredSince/{unix-milliseconden}/p/2/
```

Dit is een openbare HTML-zoekpagina, opgebouwd met de tekstfilterroute `ta` die
Marktplaats zelf in zijn publieke clientcode beschrijft. De app roept geen
`/lrp/api/search`, `/lp/api/listings` of andere verboden interne zoek-API aan.
De actuele robots.txt staat deze route toe. Robots.txt vervangt de voorwaarden
van de aanbieder niet; blokkades en bronlimieten blijven van kracht.

## Daadwerkelijke bevinding

De oude brede iPhone-pagina had 48.297 resultaten. De eerste 30 plaatsen waren
in de controle allemaal betaald: dagtoppers of Admarkt. De queryparameters
`sortBy=SORT_INDEX&sortOrder=DECREASING` werden niet als sortering overgenomen.
De eerdere conclusie dat dit een onoplosbare pagina-dekkingsgrens vormde was te
breed: een **publiek tijdvenster werkt wel**.

| Read-only controle | Resultaat |
|---|---|
| Brede iPhone-pagina, 07:36:14 UTC | 30 betaalde plaatsen, 0 onbetaalde plaatsen |
| Laatste vijf minuten, 07:36:19 UTC | 7 resultaten totaal, alle 7 gewoon aanbod |
| Vijf minuten in de toekomst, 07:36:24 UTC | 0 resultaten |
| Volgende recente controle, 07:37:00 UTC | nieuwe advertentie `m2454937263` zichtbaar |
| Volgende recente controle, 07:37:30 UTC | nieuwe advertentie `m2454937365` zichtbaar |

Elke recente response bevestigde het gevraagde numerieke `offeredSince` onder
`searchRequest.attributesByKey`. Het lege toekomstvenster is een negatieve
controle: een response die alleen een filter echoot zou onvoldoende bewijs
zijn. De nieuwe advertenties verschenen in controles met tussenpozen van
30,918 en 30,665 seconden. Dit zijn **geen gemeten publicatie→iPhone-tijden**:
het exacte publicatietijdstip en zichtbare telefoonontvangst zijn niet bewezen.
De volledige, beperkte JSON-uitvoer staat in
[evidence/recent-source-2026-10-18.json](evidence/recent-source-2026-10-18.json).

## Implementatie

De centrale Smart Inkoopradar gebruikt in snelle modus standaard een overlap
van vijf minuten (`scheduler.fast.recentWindowMinutes`). Binnen dit kleine
venster wordt elk gevonden resultaat verwerkt, onafhankelijk van een hoge
winst-/AI-score. Een exacte sortering is hierdoor bij een klein venster niet
nodig om nieuwe kansen te zien. Het systeem claimt geen onbewezen datumvolgorde.

- Per query wordt na uitval verder teruggekeken tot de laatste afgeronde
  controle minus 90 seconden overlap, begrensd op 24 uur. Die oude inhaalslag
  is geen garantie dat advertenties met langer uitgestelde indexering worden
  ontdekt. De concrete vensterstart is zichtbaar op het prestatiescherm.
- De bron moet het exacte venster bevestigen voordat advertenties naar ingest
  gaan. Zonder bevestiging meldt de controle een fout; oude brede resultaten
  worden niet stilzwijgend als recente detectie behandeld.
- Publicatiedata blijven dagindicaties waar de bron alleen een dag geeft.
  De venstergrens wordt nooit als exact publicatietijdstip opgeslagen.
- Elke pagina gaat direct naar de bestaande transactionele ingest, snelle
  analyse en notificatielane. AI en detailverrijking wachten daar niet vóór.
- Bij normaal volume passen iPhone, MacBook, iPad, Watch en AirPods met vijf
  requests in één ronde van 30 seconden bij het bestaande 12/min-budget.
  Koude modelfacetten blokkeren deze recente route niet.
- Bij een grotere resultatenlijst worden vervolgpagina’s gebruikt binnen het
  berekende rondebudget. De oude eenpagina-instelling beperkt deze nieuwe
  centrale route niet; de gedeelde pacing en het rondebudget blijven leidend.
- Bij onvoldoende budget worden venster en volgende pagina duurzaam bewaard.
  Een volgende ronde bezoekt opnieuw de kop én de vervolgpagina; met slechts
  één slot wisselen die af. Dit voorkomt dat pagina 2 permanent onzichtbaar
  blijft. Bij groeiende achterstand is onder een minuut niet voor elk resultaat
  haalbaar; de resterende vervolgpagina is daarom zichtbaar.
- Eerdere queryvoortgang blijft bewaard wanneer een latere query mislukt.
- Dezelfde advertentie in overlappende vensters geeft geen dubbele eerste push.
- `recentWindowMinutes=0` herstelt de oude brede/model-slice-strategie. Er zijn
  geen nieuwe verwijderingen of profielmigraties. Advertenties, historie,
  instellingen en profielbackups blijven behouden.

De instellingen en bronmonitor zijn gecontroleerd met de React-richtlijnen:
veldlabels blijven gekoppeld, er komt geen extra polling-effect bij, brondata
wordt server-side geladen en het hoofd-dashboard krijgt geen extra panelen.

## Andere onderzochte routes

- Officiële API v1/v2 en de officiële GitHub-handleiding: geen nieuwe bewezen
  zoekrechten of datum-sortering. Zie het eerdere API-onderzoek.
- Open-source monitors, RSS-Bridge en diverse scraperdiensten: meerdere snelle
  oplossingen gebruiken de verboden interne zoekroute. Geen zulke code of
  omzeiling overgenomen; commerciële claims zijn geen bewijs van toestemming.
- Oude `rss.xml?query=iphone`: HTTP 404. Oude RSS-extensies en gidsen bewijzen
  geen nog werkende actuele feed.
- Publieke C2C-sitemap: 21.361 URLs, waarvan 516 Apple-gerelateerd in deze
  steekproef. De opgehaalde sitemap was circa 19 minuten oud en bevatte
  dagbatches. Daarom geen geschikte basis voor een minuutdemonstratie.
- Publieke verkoperspagina werkt, maar geeft alleen die verkoper weer en geen
  bewezen algemene nieuwste-eerst-feed. Niet als algemene radar gepresenteerd.
- Oude publieke `/s/sort_index/decreasing/`-route: 404 na canonicalisatie.
  Geen ongeverifieerde sorteerparameter als werkende oplossing ingezet.

## Reproduceren

```bash
npm run verify:recent -- iphone --compare --watch=120
# Een eigen advertentie wordt alleen gezocht in echte bronresultaten, nooit geïmporteerd:
npm run verify:recent -- iphone --watch=120 --target=m1234567890
npm run lint
npm test
npm run build
npm run test:e2e
```

De probe controleert robots.txt, beperkt requests, volgt geen redirects en
stopt bij een bronfout. Een doel-ID is alleen een controle op de zoekresultaten;
het injecteert geen advertentie en verstuurt geen testpush.

## Eerlijke demonstratie

1. Rol de geteste release bewust uit naar zowel web als worker, met een backup
   van database/configuratie. De bestaande branch bevat ook de eerdere
   additieve `CheckRun.sourceId`-migratie; die moet vóór de nieuwe processen
   worden toegepast. De oude databasevolumes blijven behouden.
2. Controleer heartbeat, succesvolle recente iPhone-controle, afgerond
   zoekvenster en bestaande profielnulmeting. Controleer actief iOS-apparaat,
   meldingsrechten, voorkeuren en stilteperiode. Een testpush controleert de
   telefoonverbinding afzonderlijk en bewijst geen advertentiedetectie.
3. Open de geïnstalleerde app voor een zichtbare pop-up (bestaande polling:
   5 seconden) of sluit hem voor de aparte echte iPhone-pushtest.
4. Plaats zelf een legitieme, passende Apple-advertentie. Noteer het echte
   bevestigingstijdstip en de URL. Voeg die URL niet via import toe en kies geen
   speciale alleen-op-de-eigen-verkoper-bron om een algemene radar na te bootsen.
5. Meet bronzichtbaarheid → eerste detectie → melding aangemaakt → pushdienst
   accepteert → zichtbare iPhone-ontvangst. Alleen de laatste stap kan de
   gebruiker op zijn telefoon bevestigen.

Doel bij normaal volume: controleren iedere 30 seconden, daarna de bestaande
snelle meldingsketen en eventueel maximaal circa 5 seconden pop-uppolling.
Publicatie/indexering door Marktplaats blijft een externe stap. Zonder een
nieuwe gecontroleerde plaatsing en echte telefoonontvangst claimen we nog geen
bewezen publicatie→iPhone binnen 60 seconden.

## Opleververificatie

- Volledige unit-/integratiesuite: **474 tests in 32 bestanden geslaagd**.
- De gerichte recente-bronsuite is daarna opnieuw geslaagd met **150 advertenties
  over vijf pagina’s**, hervatten bij een kleiner budget, de eerste pagina
  opnieuw bezoeken, één voorlopige push en weigering van een genegeerd filter.
- `npm run lint`: geslaagd (TypeScript; geen afzonderlijke ESLint-config).
- `npm run build`: geslaagd op de uiteindelijke code.
- `npm run test:e2e`: **16 tests geslaagd**, inclusief het recente venster in de
  instellingen, bronstatus, mobiel, bestaande PWA-onderdelen en Marktplaats-links.
- Live read-only controle: echte bronresultaten, exacte filterbevestiging en lege
  toekomstcontrole; twee nieuwe echte advertenties in opvolgende controles.
- Geen advertentie via doel-URL geïmporteerd, geen testpush naar de echte iPhone
  verstuurd en geen productiedeployment uitgevoerd voor deze verificatie.
