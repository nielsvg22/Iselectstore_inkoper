# Databronnen en Marktplaats-integratie

## Onderzoeksresultaat (wat is wel/niet geverifieerd)

| Vraag | Bevinding |
|---|---|
| Is er een publiek gedocumenteerde Marktplaats-zoek-API voor kopers? | **Niet gevonden.** Zoekopdrachten naar developer-/partnerdocumentatie leverden alleen derde partijen op (Channable, Koongo, scrapers op Apify). Die gebruiken ofwel een partner-/verkopersintegratie (advertenties *plaatsen*) ofwel scraping. |
| Kan deze applicatie vanuit de ontwikkelomgeving Marktplaats live benaderen? | **Nee.** In de omgeving waarin dit is gebouwd blokkeert de proxy marktplaats.nl (HTTP 403 op CONNECT). Er is dus **geen live-ophaling uitgevoerd of geverifieerd.** |
| Is de pagina-parser getest op echte Marktplaats-HTML? | **Nee.** Hij is getest op fixtures met schema.org JSON-LD, ingebedde state-JSON en OpenGraph — gangbare structuren. De exacte actuele structuur van Marktplaats kan afwijken. |

Daarom zijn er **geen verzonnen API-endpoints** gebruikt en wordt niets als "automatisch zoeken op Marktplaats" gepresenteerd.

## Wat de app wel doet

1. **URL-import** (`/import`, en profielen met bron "Advertentie-URL's"): haalt de pagina's op die *u* opgeeft.
   Beveiliging/etiquette: alleen https, host-allowlist (standaard `marktplaats.nl`), SSRF-bescherming (ook bij redirects en op connect-tijd), robots.txt-controle, minimaal 3 s tussen requests, dagelijkse limiet, groottelimiet. Bij 401/403/429 of een CAPTCHA stopt de app met een duidelijke fout; **er wordt niets omzeild.**
2. **Export-import** (JSON/CSV plakken of uploaden): voor data uit een toegestane bron (eigen export, partnerfeed, verzamelaar).
3. **Feed-profielen**: periodiek een door u geautoriseerde JSON/CSV-URL ophalen.
4. **Partner-API-adapter**: bewust een lege plaatshouder (`src/lib/sources/adapters.ts` → `partnerAdapter`). Zodra u van Marktplaats toegang + documentatie krijgt, implementeert u hier `fetchProfile()`; de rest van het systeem (dedup, analyse, scoring, meldingen) werkt ongewijzigd.
5. **Demodata**: duidelijk gemarkeerde voorbeeldadvertenties (`isDemo`, titel `[DEMO]`), gescheiden van echte data, zonder meldingen.

## Eerste stap in uw eigen omgeving: controleer of ophalen echt werkt

```bash
npm run verify:source -- https://www.marktplaats.nl/v/<categorie>/<…>/m1234567890-<titel>
```

of in de app: *Importeren → Test uitlezing*. Dit haalt één pagina op, toont wat is uitgelezen (id, titel, prijs, foto's, locatie) en slaat niets op.
Lukt dat niet (blokkade, andere paginastructuur): gebruik de export-import, of pas `parseListingHtml` in `src/lib/sources/listing-parser.ts` aan — de bestaande tests laten zien welke structuren worden ondersteund.

## Voorwaarden

Controleer vóór automatisch gebruik de actuele gebruiksvoorwaarden van Marktplaats. Deze applicatie dwingt ze niet af; zij beperkt zich tot rustig, door u gestuurd ophalen en respecteert robots.txt.
