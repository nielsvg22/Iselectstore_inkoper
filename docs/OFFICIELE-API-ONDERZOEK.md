# Marktplaats / GoedGeplaatst: onderzoek en implementatie

Gecontroleerd op 18 oktober 2026. Branch: `feature/official-api-realtime-radar`.
Deze wijzigingen zijn niet naar productie gedeployed. Bestaande advertenties,
inkopen, instellingen en gearchiveerde profielen blijven behouden.

## 1. GoedGeplaatst: geen zoektoegang met de bestaande koppeling

De bestaande integratie staat in `nielsvg22/Iselectstore-marktplaats-` (main,
`193597a`). Deze repository is alleen gelezen; de Shopify-webshop is niet
gewijzigd. De API-key in de Coolify-plaatsingsapp komt overeen met de door de
beheerder aangeleverde key. Omgeving: productie. Er staan geen afzonderlijke
Marktplaats OAuth-clientcredentials in de twee relevante Coolify-apps.
De afzonderlijke directe Marktplaats-integratie in de plaatsingsapp staat op
`MARKTPLAATS_ENVIRONMENT=mock`. De read-only connection-status bevestigt
`environment:mock`, `connected:false`, `lastSuccessfulCallAt:null`;
`tokenValid:true` is in die mockcode een vaste testwaarde, geen bewijs van een
echt geldig token. De GoedGeplaatst-integratie staat wél op productie.

Officiële documentatie:

- https://docs.goedgeplaatst.nl/api/rest/v1/site/
- https://docs.goedgeplaatst.nl/api/rest/v1/site/authentication/
- https://docs.goedgeplaatst.nl/api/rest/v1/site/ads/
- https://docs.goedgeplaatst.nl/api/rest/v1/site/oauth/

Authenticatie: `Authentication: <GoedGeplaatst API-key>`. Het `/ads/`-endpoint
levert advertenties **van de eigen client**, geen algemene Marktplaats-zoekindex.
De gedocumenteerde zoekfilters beperken deze eigen advertenties. De documentatie
bevat geen algemene zoek- of reviewbron voor andere verkopers.

Read-only requests met de echte key (geen waarden of persoonsgegevens opgeslagen
in Git):

| Request | Werkelijk resultaat |
|---|---|
| `GET /rest/v1/users/?useCache=0&page=1&itemsPerPage=1` | HTTP 200, `result:true`, eigen clientgebruiker beschikbaar |
| `GET /rest/v1/ads/` zonder userId | HTTP 400, `missing field: userId` (validatiefout, geen auth-bewijs) |
| `GET /rest/v1/ads/?userId={eigen gebruiker}&useCache=0&page=1&itemsPerPage=1&simple=1` | HTTP 200, `result:true`, `totalItems:0` |
| `GET /rest/v1/oauth/{eigen gebruiker}/marktplaats/?useCache=0` | HTTP 403, `result:false`, `access denied - internal feature` |

De laatste drie functionele probes zijn opnieuw uitgevoerd met het meegeleverde
verificatiescript. Na de OAuth-weigering zijn geen aliasroutes, browsercookies,
refreshes of andere omwegen gebruikt. Er is niets geplaatst, gewijzigd of
verwijderd. De GoedGeplaatst-key is nooit als Marktplaats Bearer-token verstuurd.

Conclusie: **nee, de bestaande GoedGeplaatst-koppeling geeft op dit moment geen
bruikbare, aangetoonde toegang tot advertenties van derden**. Alleen
GoedGeplaatst kan bevestigen of aanvullende partnerrechten mogelijk zijn.

## 2. Marktplaats Search API bestaat wel

De eerdere bewering in deze repository dat geen gedocumenteerde Search API
bestaat was onjuist en is gecorrigeerd.

Officiële bronnen:

- Zoekresource: https://api.marktplaats.nl/docs/v2/search-advertisements.html
- OAuth: https://api.marktplaats.nl/docs/v2/authentication.html
- Reviews: https://api.marktplaats.nl/docs/v2/user-reviews.html
- Gebruiker: https://api.marktplaats.nl/docs/v2/user.html
- Advertenties: https://api.marktplaats.nl/docs/v2/advertisement.html
- Webhooks: https://api.marktplaats.nl/docs/v2/webhooks.html
- Overzicht: https://api.marktplaats.nl/docs/v2/overview.html

`/docs/v2/search.html` is de zoekfunctie van de documentatiesite, niet de
beschrijving van een zoekresource.

`GET /v2/search` ondersteunt onder andere `query` (met and/or/haakjes),
`categoryId`, `sellerId`, `postCode`, `distance` in meters, `offset`, `limit`
(maximaal 200) en `locale`. De gedocumenteerde sorteervelden zijn alleen
`default`, `location`, `price`, met `ascending`/`descending`. Een publicatiedatum-
sortering, `publishedAfter`, wijzigingscursor of webhook voor alle nieuwe
advertenties is **niet** gedocumenteerd. De beschreven webhooks betreffen o.a.
LMS-leads en vereisen contact met Marktplaats.

Een anonieme read-only `GET /v2/search?query=iphone&offset=0&limit=1` gaf HTTP 401.
Er is geen eigen bruikbaar Marktplaats OAuth-token geconfigureerd; daarom is
zoeken met een geldig eigen clienttoken **nog niet geverifieerd**. Deze 401 is
geen bewijs dat een correct toegelaten partner ook zou worden geweigerd.
De documentatie voor de volledige advertentieresource meldt bovendien dat deze
alleen eigen advertenties toegankelijk maakt. Zoekresultaten zijn dus geen
bewijs van toegang tot volledige advertenties van derden.

| Categorie | Status |
|---|---|
| Technisch beschikbaar | Gedocumenteerde Search- en reviewresources |
| Met huidige key bewezen | Eigen GG gebruikers/advertenties; geen externe zoekbron |
| Aanvullende rechten nodig | Eigen MP OAuth-client/scopes voor zoeken; reviewtoegang en limieten laten bevestigen |
| Niet aangetoond / niet gebruikt | Nieuwste-eerst, globale realtime-webhook, externe volledige advertentieresource, interne zoek-API’s |

## 3. Verkopersreviews en betrouwbaarheid

`GET /v2/users/{userId}/reviews` documenteert `numberOfReviews`, `averageScore` en
subscores. Er zijn ook externe platformscores waarvoor een betaald Klantscore-
product nodig kan zijn. De voorbeelden bevatten scores als 5,8 en 8,2: een
uniforme schaal van 0–5 is daarmee niet bevestigd. Het totaal aantal reviews
bewijst evenmin dat dit allemaal positieve reviews zijn.

De huidige credentials geven geen aantoonbare toegang tot deze externe reviews.
Het gedocumenteerde `confirmDate` van een gebruiker is de bevestigingsdatum,
niet de bewezen aanmaakdatum van het account. Er wordt dus geen accountleeftijd
of 4,6/5-beoordeling uit deze velden verzonnen of omgerekend. De nieuwe adapter
laat rating, reviewaantal, accountleeftijd, verzendmogelijkheid en afstand
onbekend zolang de bron ze niet betrouwbaar levert. Het bestaande beleid
blijft gelden: buiten 40 km alleen betrouwbare verzending bij voldoende
bewezen gegevens, anders handmatig controleren. Een hoge score is geen garantie.

## 4. Wat is gebouwd

- Werkelijke officiële Search-adapter achter drie expliciete instellingen:
  bron `PARTNER_API` toegestaan, `officialApi.enabled` en `accessApproved`.
  Eigen OAuth-token versleuteld opgeslagen of via `MARKTPLAATS_ACCESS_TOKEN`.
  Standaard uit; geen credentials of productiedata opgenomen in deze branch.
- Eén brede boolean zoekopdracht uit de producten van de centrale radar;
  ook zoeken in de beschrijving voor onvolledige titels, geen tientallen
  model/opslagrequests of ongedocumenteerde datumparameters.
  GET-only, vaste host, geen redirects/HAL-URL’s volgen, begrensde response en
  timeout. Alleen bevestigde contractvelden worden gelezen; prijzen in centen.
- Onafhankelijke API-joblane en scheduler binnen hetzelfde zichtbare radarprofiel.
  Publieke HTML en officiële API hebben eigen duurzame requestlimieten.
  `Retry-After` wordt gerespecteerd; HTTP 401/403 blokkeert herhaalde requests met
  hetzelfde token. HTTP 429 pauzeert minimaal 15 minuten (of langer volgens de
  bron); 5xx gebruikt bestaande jobretry/backoff. Geen gedeeld plaatsingstoken
  verversen of intrekken. Eigen toegangstoken moet tijdig opnieuw geautoriseerd
  worden: automatische OAuth-inrichting is zonder eigen client niet beschikbaar.
- Gedeelde, transactionele ingest met advertentie-lock op bron + canoniek ID.
  Simultane detectie schrijft één advertentie, prijshistorie en analysejob.
  Eerste detectietijd blijft behouden. Onvolledige samenvattingen verdringen
  geen bekende locatie, verkopersfeiten, foto’s of exact publicatietijdstip.
- Snelle voorlopige analyse/push blijft onafhankelijk van volledige analyse.
  Ook API-samenvattingen worden correct als voorlopig behandeld. Bestaande
  notificatiededuplicatie blijft actief; detailverrijking geeft geen extra push.
- Publieke radar gebruikt het bestaande requestbudget in plaats van altijd
  twee pagina’s: bij 30 sec / 12 rpm / 3 sec minimum maximaal vijf eenpagina-
  zoekeenheden, met ruimte voor één detailrequest. Bij 6 rpm blijven dat er twee.
  iPhone gaat voor; andere families roteren eerlijk op laatste werkelijke
  controle, met maximaal één modelslice. Bij slechts één slot roteren de brede
  productgroepen, zodat ze niet permanent worden overgeslagen.
- Additieve DB-migratie: nullable `CheckRun.sourceId` + index. Geen verwijdering,
  profielvervanging of nieuwe profielmigratie; de eerdere herstelbare centrale
  radar en backups blijven intact. Oude runs worden niet achteraf aan een
  onbewezen bron toegewezen.
- Prestaties: echte intervallen per bron/profiel, fouten, nieuw gevonden aantal,
  bronstatus/budget, controle per productgroep, exact publicatie→detectie en
  detectie→pushdienst. Dagindicaties tellen niet als exacte publicatietijd.
  Telegram-verzendingen tellen niet mee in Web Push-latency. Datum-zonder-tijd
  en tijdstippen zonder tijdzone worden nooit als exact aangemerkt.
- Detailverrijking neemt ook echte bezorg-/conditiegegevens mee. Een
  ontkenning zoals “verzenden is niet mogelijk” wordt geen verzendoptie; alleen
  herkende bevestigende gestructureerde leveringswaarden tellen mee.

## 5. Echte metingen en grenzen

Read-only productiecontrole op 18 oktober 2026, 07:03 UTC, bestaande release:

- Worker gezond; iOS-abonnement actief, nul apparaatfouten; geen stilteperiode,
  winst- of scoredrempel in de actieve pushvoorkeuren.
- 62 voltooide radarrondes in workerlogs van 06:32:01 tot 07:03:11 UTC.
  61 startintervallen: gemiddeld **30,65 s**, mediaan **30,52 s**.
  Elke ronde twee pagina’s; drie nieuwe advertenties in dat venster.
- Laatste tien werkelijk verzonden Web Push-meldingen: **0,935–5,646 s** tussen
  eerste detectie en acceptatie door de pushdienst. Dit is een kleine recente
  steekproef, geen SLA en geen ontvangstbewijs van de iPhone.
- Dit bewijst geen publicatie→push binnen 60 seconden. Publicatie/indexering en
  de rangschikking van de bron blijven bepalend. Bij publieke HTML staan nieuwe
  advertenties niet gegarandeerd op de eerste pagina; de officiële Search API
  documenteert evenmin datum-sortering. Geen empirische maximale detectietijd
  of snelheidvergelijking van beide bronnen mogelijk zonder echte API-toegang.

De verbeterde vijfpagina-verdeling is lokaal getest; productie draait nog de
vorige branch. Er is voor deze opdracht geen nieuwe testmelding naar de echte
telefoon gestuurd en geen nieuwe iPhone-ontvangst geclaimd.

## 6. Reproduceerbare verificatie

Gebruik uitsluitend afzonderlijke lokale testdatabases; de integratietests
wissen hun testtabellen. Nooit een productie-URL als TEST_DATABASE_URL gebruiken.

```bash
npm ci
npm run lint                  # TypeScript; dit project heeft geen aparte ESLint-config
npm test                      # PostgreSQL dealhunter_test nodig
npm run build
npm run test:e2e               # PostgreSQL dealhunter_e2e nodig

# Read-only; sleutelbestand mode 600, waarden nooit als CLI-argument of in Git.
GOEDGEPLAATST_API_KEY_FILE=/private/gg-key npm run verify:official -- goedgeplaatst
npm run verify:official -- marktplaats-anonymous
# Alleen met een EIGEN geautoriseerd Marktplaats-token:
MARKTPLAATS_TOKEN_FILE=/private/mp-token npm run verify:official -- marktplaats
```

De contracttests gebruiken expliciet gemarkeerde fixtures; er verschijnen geen
fixture-advertenties in de echte app. De tests omvatten adaptervelden/auth,
HTTP-fouten, gedeelde pacing, parallelle ingest, onbekende veiligheidsvelden,
exacte tijdstempels, eerlijke queryplanning en één voorlopige push na detectie
via twee bronnen. De bestaande tests controleren filters, risico’s, migratie-
herstel, afstand, 50 gelijktijdige kansen, iOS-onboarding en Marktplaats-links.

Testresultaten van de uiteindelijke commit staan in de oplevernotitie hieronder.

## 7. Nodige vervolgstappen

1. Vraag GoedGeplaatst of een officiële zoek-/partnerautorisatie bestaat; de
   huidige key wordt geweigerd voor het gekoppelde OAuth-endpoint. Vraag geen
   toegang tot gedeelde tokens als vervanging voor eigen toegestane zoekrechten.
2. Vraag Marktplaats om eigen Search OAuth-toegang, toegestane requestlimieten,
   externe reviewrechten met exacte scoreschaal, echte account-aanmaakdatum en
   eventueel een nieuwste-eerst/feed/webhook-afspraak. Gedocumenteerd betekent
   niet automatisch dat deze applicatie de juiste scopes heeft.
3. Test daarna met een eigen token de adapter op echte advertenties en laat de
   bronvolgorde/dekking en publicatie→push met een nieuwe advertentie meten.
4. Activeer de officiële bron pas na die goedkeuring/configuratie. Verifieer de
   iPhone als geïnstalleerde PWA, buiten stilteperiode, met echte testpush en
   gesloten app. Pushdienstacceptatie is geen bewijs van zichtbare ontvangst.
5. Een bewuste release vereist databasebackup, additieve migratie, web+worker
   samen bijwerken en controleren op heartbeat, bronfouten en querydekking.
   Rollback kan de vorige code gebruiken: de extra nullable kolom blijft staan.
   Profielbackups, advertentiehistorie en het Coolify-databasevolume behouden.


## Opleververificatie — 18 oktober 2026

- `npm run lint`: geslaagd (TypeScript).
- `npm test`: **464 tests in 30 bestanden geslaagd** op de geïsoleerde lokale
  PostgreSQL-testdatabase. Inclusief de extra datum-/verzendveiligheidstests.
- `npm run build`: geslaagd, Next.js-productiebuild met typecontrole.
- `prisma validate` en `prisma migrate status` met expliciete lokale test-URL:
  geldig schema, alle 10 migraties toegepast. Geen productiemigratie uitgevoerd.
- `npm run test:e2e`: **16 tests geslaagd**. Na uitbreiding van de bron-/mobiele
  controles is `playwright test tests/e2e/radar.spec.ts` opnieuw geslaagd op de
  uiteindelijke build. Controleert de uitgeschakelde officiële bron, leeg
  tokenveld, exact-tijdmeting, Marktplaats-link, bewaren en profielherstel.
- Read-only GoedGeplaatst-probes opnieuw met `verify:official`: eigen resources
  HTTP 200, gekoppelde OAuth-resource HTTP 403. Anonieme Search-probe HTTP 401.
- Gewijzigde bestanden gecontroleerd op de werkelijk gebruikte credentials:
  geen matches. De repository met de plaatsingskoppeling is ongewijzigd.
- Geen productieconfiguratie, databasevolume, Shopify-webshop of Coolify-release
  gewijzigd. De officiële adapter is contract-/integratiegetest, nog niet met
  echte geautoriseerde Search-resultaten of externe reviews geverifieerd.
