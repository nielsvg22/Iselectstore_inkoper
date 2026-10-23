# Best Buy Phone — zoekfilters & vuistregels in de app

Bron: "Best Buy Phone Zoekfilters & Vuistregels" (49 pagina's). Dit document zegt per onderdeel wat er gebouwd is, waar het staat,
welke keuze is gemaakt bij tegenstrijdigheden en wat bewust **niet** is gebouwd.

Scherm: **Inkoopregels** (`/rules`) · **Funnel & aanbod** (`/funnel`) · code: `src/lib/rules/*`, `src/lib/funnel.ts`.

## Wat is gebouwd

| Onderdeel uit het document | Waar |
|---|---|
| Zoekprijs = verkoopprijs in perfecte staat; batterij en kras gaan er vanaf | `rules/verdict.ts`, basisprijzen in `/rules` |
| Batterijtabel 80–100% (−25 … +100), onder 80% nooit kopen | `rules/battery.ts`, `rules/tables.ts` |
| Batterij onbekend → aanname op leeftijd model (100% tot 6 mnd, −1%/mnd, min. 82%) | `rules/battery.ts` (releasedata iPhone in `tables.ts`) |
| Kras onbekend −€50, met krassen −€100; krasvrij/altijd hoesje-woorden; conditie "Nieuw" = krasvrij | `rules/scratch.ts` |
| Marge- en hoge-marge-tabel (vraagprijs en bieden vanaf), 💰 alleen als alles bekend is | `rules/margin.ts`, `verdict.ts` |
| Vraagprijs ↔ bieden vanaf: onder 65% of gat > €250 → gemiddelde | `rules/bid.ts` |
| Bieden vanaf €0: alleen interessant bij batterij 85%+, krasvrij en betrouwbaar of dichtbij | `verdict.ts` (instelbaar: filteren of alleen markeren) |
| Prijs uit titel/omschrijving (alleen zonder prijsinformatie) | `rules/price-text.ts`, getest op 137 voorbeelden uit het document |
| Ophalen ≤ 50 km hemelsbreed, verzenden tot 300 km, nieuwste Pro/Pro Max max. 50 km | `verdict.ts`, `rules/release.ts` |
| Verzendfilter naar accountleeftijd (2–3 jr 30+ reviews/5★/ID … 10+ jr 2+ reviews) | `rules/shipping.ts` |
| Rijfilter €1/km als de verkoper niet aan het verzendfilter voldoet | `verdict.ts` |
| 📍 onder 10 km, 🔴/rode titel onder 20 km, Veenendaal 15 km, +€20 binnen 10 km | `rules/geo.ts`, deals-lijst en melding |
| Minimumprijs €70 (nieuwere) / €50 (oudere modellen) | `rules/release.ts` |
| Intel-Macs uitsluiten; MacBook Air: M1–M4, 13/15″, RAM 8/16/32, SSD 256–2048 | `verdict.ts` (instelbaar) |
| RAM boven standaard = bedrag erbij; iPad 4G/5G +€50 | `verdict.ts` (RAM-bedragen staan op €0 tot ze zijn ingevuld) |
| iPad-waarderingslijst (maximale inkoopprijzen, per schermmaat) | voorgevuld in `/rules` |
| Opslag onbekend → "?" en gemiddelde basisprijs; batterij onbekend → "?" | melding en deal |
| 🛒 direct kopen | Marktplaats-kenmerk `SHOPPING_CART` (zie beperkingen) |
| Onderwerp/titel uniek per model met emoji's | `notify/message.ts` |
| Mail-uitleg: max verkoopprijs = basis − batterij − kras, toegestane vraag/bieden, hoge marge | push, Telegram en advertentiepagina |
| Loggen: batterij, MP-conditie, reviews/ratings (beschikbaarheid), hoe vaak gezien | `/funnel`, `Advertisement.seenCount` |
| Aanbodoverzicht per model met verschil t.o.v. vorige periode | `/funnel` |
| Funnel: verstuurd → geopend → doorgeklikt → gekocht; "weinig geopend" met voorbeelden | `/funnel`, `lib/funnel.ts` |
| M-nummers van gekochte advertenties (plakken of uit Telegram-kanaal) + herinnering na 3 dagen | `/funnel`, `rules/maintenance.ts` |
| Voorraadregel (veel op voorraad → alleen 💰) | `verdict.ts` (uit tot ingeschakeld) |
| Maandelijkse prijsaanpassing in % + wijzigingslog | `rules/maintenance.ts` |
| Testen op bestaande advertenties | `/rules` → "Controleren" |

## Overzichten en controle

- **Beslisboom** (`/rules/beslisboom`): alle stappen in volgorde met de waarden uit de instellingen. Kies een advertentie om te zien welke stap hem tegenhield.
- **Ingekocht: wat zeiden de regels?** (`/funnel`): de gekochte M-nummers naast het oordeel van de huidige regels, met per regel hoeveel gekochte advertenties hij tegenhield en welke advertenties de app nooit heeft gezien.

## Keuzes bij tegenstrijdigheden (alles instelbaar)

| Vraag | Standaard | Waarom |
|---|---|---|
| Zoekprijs bij 85% batterij of in perfecte staat? | perfecte staat | "Nieuwe manier van zoeken" staat in het document als volgende stap. **Let op:** de mailvoorbeelden en logregels in het document laten zien dat het huidige systeem rekent als *zoekfilter + batterij + kras* (krasvrij +€40, onbekend €0): dat is de oude vuistregel (`priceBase: buy85`) |
| Twee marge-tabellen | A (mailvoorbeeld) | B (💰-indicator) is te kiezen |
| Hoge-marge-extra voor bieden vanaf | zelfde als vraagprijs | zo rekent het voorbeeld in het document (−€30 op beide) |
| Gat vraag/bieden | €250 | document noemt ook 150/200 |
| Verzendfilter | tabel uit het document | strenger dan de eerdere app-instelling (4,6 / 15 / 12 mnd) |
| Rijfilter en +€20 binnen 10 km | aan | Twan's notitie 10-6-2026; in het document nog "willen we dit?" |
| Hoge marge minimaal | €80 (vraag) / €100 (bieden) | "beter … proberen?" in het document |
| Zonder basisprijs | bestaande waardering | anders zou niets meer melden zolang de lijst leeg is |

## Bewust niet gebouwd

- **Automatisch berichten sturen naar verkopers** ("Next Level Slimme Auto Messenger"): geautomatiseerd contact op Marktplaats; niet zonder toestemming van Marktplaats.
- **E-mailalerts, open/click-statistiekmails, commissie- en factuurgegevens, Webflow-CMS, Facebook Marketplace**: horen bij hun eigen mailservice/organisatie; de app heeft de funnel zelf (push en pop-up).
- **Reviews, sterren en accountleeftijd van verkopers**: de publieke zoekpagina levert die niet. Het verzendfilter keurt daarom nooit zomaar goed: zonder die gegevens staat er "Verkoper handmatig controleren".
- **Basisprijzen per iPhone/Mac**: moeten door Twan worden ingevuld (alleen de iPad-lijst stond in het document).
- **Kras-aftrek afhankelijk van leeftijd model**, "Resale Alerts", automatische voorraad-/omloopsnelheidsanalyse: in het document als "voor later".

## Beperkingen

- Direct kopen (🛒) volgt het Marktplaats-kenmerk `SHOPPING_CART` in de zoekresultaten; dat is afgeleid uit echte data, niet uit documentatie van Marktplaats.
- De drie PDF-voorbeelden met "€25§0" en "meerprijs 50"/"inclusief verzenden 20" zijn niet als toestelprijs gelezen.
- Afstand is hemelsbreed vanaf het centrum van Apeldoorn/Veenendaal, geen rijafstand.
