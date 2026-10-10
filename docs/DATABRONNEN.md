# Databronnen en Marktplaats-integratie

## Onderzoeksresultaat

| Vraag | Bevinding (gecontroleerd op 2026-10-10) |
|---|---|
| Is er een publiek gedocumenteerde Marktplaats-zoek-API voor kopers? | **Nee.** Alleen verkopers-/partnerintegraties (advertenties plaatsen). |
| Mag de interne JSON-zoek-API (`/lrp/api/search`) gebruikt worden? | **Nee.** `robots.txt` verbiedt expliciet `/lrp/api/search*`, `/lp/api/listings*`, `/search?q=*` en `*/n/*`. Deze app gebruikt ze **niet**. |
| Zijn de gewone zoek-/categoriepagina's toegestaan? | **Ja volgens robots.txt**: `/q/<zoekterm>/`, `/l/<categorie>/q/<zoekterm>/` en `/p/<n>/` staan niet in de Disallow-lijst. Ze leveren HTTP 200 met alle resultaten als ingebedde data (`__NEXT_DATA__`, 30 per pagina). |
| Werkt het ophalen echt? | **Ja, live getest** (dezelfde code als de app, 2 pagina's + detailpagina's): echte advertenties met titel, prijs, plaats, foto's, batterij/kleur-kenmerken en volledige tekst. |

> robots.txt is geen gebruiksvoorwaarde. Controleer zelf of automatisch gebruik past bij de voorwaarden van Marktplaats. De app blijft daarom bewust rustig: minimaal 3 s tussen requests, standaard 3 pagina's per zoekterm, dagelijkse requestlimiet, geen omzeiling van blokkades (bij 403/429 of een botcontrole stopt hij met een duidelijke melding).

## Hoe automatisch zoeken werkt (zoekprofiel → bron "Zoeken op Marktplaats")

1. Je geeft **zoektermen** (bijv. `iphone 15 pro`), optioneel een **categorie** en het aantal **pagina's** (30 resultaten per pagina).
2. De app haalt de zoekpagina's op (robots.txt-controle, SSRF-bescherming, vertraging) en leest alle advertenties uit.
3. **Jouw filters** (maximale prijs, model, afstand, winst, risico, …) worden door de app zelf toegepast — Marktplaats' eigen filters zijn niet via toegestane URL's beschikbaar. Prijs- en modelfilters werken al als voorselectie vóór het opslaan; koopadvertenties ("gezocht") en losse accessoires worden altijd weggefilterd.
4. Van **nieuwe** advertenties wordt de volledige tekst van de detailpagina opgehaald (max. 15 per run), want de zoekresultaten zijn op 200 tekens afgekapt en risico's (bijv. iCloud) staan vaak verderop.
5. Daarna: herkenning → waardering → winst → risico → score → melding via Telegram.

## Overige bronnen
- **URL-import** (`/import`): losse advertentie-URL's.
- **Export-import** (JSON/CSV) en **feed-profielen** voor data uit andere toegestane bronnen.
- **Partner-API**: plaatshouder voor een officiële integratie (`partnerAdapter`).
- **Demodata**: gemarkeerde voorbeeldadvertenties, gescheiden van echte data.

## Verifiëren in je eigen omgeving
`npm run verify:source -- <advertentie-url>` of *Importeren → Test uitlezing*. Voor zoeken: maak een zoekprofiel en klik **Nu controleren**; de resultaten staan onder *Status* en op het dashboard.

## Bekende beperkingen
- De paginastructuur kan wijzigen; dan meldt de app "Onverwachte structuur van de zoekpagina" (zie Status) en moet `src/lib/sources/marktplaats-search.ts` worden aangepast. De tests bevatten een fixture van de huidige structuur.
- Afstand is onbekend zonder ingestelde locatie (`distanceMeters = -1000`); afstandsfilters laten zulke advertenties door ("indien bekend").
- Publicatiedatum is bij benadering ("Vandaag", "Gisteren", "5 okt.").
- De prijs van advertenties met "bieden vanaf" wordt als vraagprijs behandeld; "zie omschrijving"/"op aanvraag" geeft geen prijs.
