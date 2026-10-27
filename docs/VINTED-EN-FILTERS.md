# Vinted en het centrale filtersysteem

Eén filtersysteem voor Marktplaats en Vinted. Dit document beschrijft wat er is, waar de gegevens vandaan komen en wat Vinted **niet** levert.

## Vinted als gegevensbron

**Bron:** de openbare pagina's van vinted.nl (zoekresultaten, nieuwste eerst, en de advertentiepagina). `robots.txt` van Vinted staat deze pagina's toe voor gewone bezoekers (verboden zijn o.a. `/member/`, `/inbox`, `/apipie/`, `/checkout`). De app leest die pagina's met een eigen, herkenbare user-agent.

**Er is geen officiële koper-API.** Er wordt niet ingelogd, er worden geen cookies bewaard en er is geen CAPTCHA-omzeiling, proxyrotatie of andere ontwijking. Bij HTTP 403/429 of een botcontrole pauzeert de bron automatisch (15 min, oplopend tot 2 uur) en gaat er tijdens die pauze geen enkel request naar Vinted. Vinted heeft eigen gebruiksvoorwaarden; controleer of dit gebruik daarbinnen past voordat het in productie draait.

**Standaard uit.** Aanzetten kan in *Inkoopregels → Algemene filters → Platforms*. Eigen requestlimiet (standaard minimaal 8 s tussen requests, alle profielen samen), eigen scaninterval (standaard 60 s, minimaal 30 s) en aantal pagina's per zoekterm.

### Wat Vinted per advertentie wél levert
| Gegeven | Bron |
|---|---|
| Titel, prijs, foto's, conditie (Staat), verkoper-ID | zoekpagina |
| Omschrijving, opslag, batterijklasse (een bereik), simlock, kleur | advertentiepagina |
| Verkoper: aantal beoordelingen en waardering, zakelijk of particulier, "laatst gezien" | advertentiepagina |
| Kopersbescherming (kosten) en verzendkosten | advertentiepagina (prijsopbouw) |
| Elektronicaverificatie beschikbaar ja/nee | advertentiepagina (prijsopbouw) |
| Plaatsingstijd | alleen relatief ("zojuist", "5 minuten geleden"): een schatting |

### Wat Vinted niet levert (en dus nooit wordt aangenomen)
- Exacte locatie en afstand: de **40 km-regel rond Apeldoorn kan op Vinted niet worden toegepast**.
- Accountleeftijd van de verkoper.
- Het land van de verkoper op advertentieniveau: onbekend, standaard *gemarkeerd* (instelbaar: tonen / markeren / uitsluiten). Alleen de Nederlandse marktplaats (vinted.nl) wordt gelezen, maar daar kunnen ook verkopers uit andere landen staan.
- Een exact batterijpercentage in een veld: alleen de omschrijving kan dat noemen; een gevonden percentage wordt met de bron bewaard, een ontbrekend percentage wordt nooit verzonnen.

Kopersbescherming en elektronicaverificatie worden **afzonderlijk** gecontroleerd. Ontbreekt de prijsopbouw op de pagina, dan is de status *onbekend* en geldt dat niet als aanwezig.

## Het filterproces (in volgorde)
1. Nieuw? (nulmeting per profiel; alleen advertenties na de nulmeting geven een melding; één melding per advertentie en gebruiker)
2. Model herkennen
3. Staat het model, de opslag en de conditie op de modellenlijst (en is de regel actief)?
4. Accessoire of onderdeel? (instelbare woordenlijsten; "inclusief hoesje" bij een telefoon blijft toegestaan)
5. Minimumprijs, 6. Maximumprijs (per model)
7. Winstmarge: verwachte winst = doorverkoopprijs − inkoopprijs − kosten; marge per model of per verkoopprijssegment; kosten per platform (Vinted: de echte kosten uit de advertentie)
8. Batterijconditie (optioneel minimum; ontbrekend: tonen / uitsluiten / markeren)
9. Locatie (afstand van de regel en de algemene afstandsregels) en land
10. Verkoper en bescherming (beoordeling, accountleeftijd, kopersbescherming, elektronicaverificatie)
11. Pas daarna pushmelding, met de voorkeuren van de gebruiker (platform, modellen, minimale marge, maximaal aantal per uur).

Bij elke afwijzing wordt de stap en de reden bewaard in het oordeel van de advertentie. Het **filterlogboek** (*Inkoopregels → Filterlogboek*) toont dat per platform, met aantallen per stap. Advertenties die al bij het ophalen als accessoire worden weggelaten, worden per dag geteld.

## Modellenlijst
Eén lijst voor beide platforms, in het dashboard te beheren (*Inkoopregels → Modellenlijst*). Per model/opslag/conditie: min. en max. advertentieprijs, maximale afstand, type advertentie, minimale accountleeftijd, **verwachte doorverkoopprijs**, **minimale winstmarge** en **actief/inactief**. De lijst is te importeren door de tabel uit het spreadsheet te plakken.

**Skiem:** er is geen geautoriseerde koppeling of export bekend; de lijst is daarom door de klant aangeleverd (spreadsheet) en eenvoudig te importeren of handmatig te beheren. Er is niets van Skiem overgenomen: de berekeningen en filters zijn eigen, transparante regels.

## Beperkingen en afhankelijkheden
- Vinted kan wijzigen hoe de pagina's zijn opgebouwd. De parser meldt dan een duidelijke fout ("onverwacht formaat") in plaats van gegevens te verzinnen.
- Zonder doorverkoopprijs bij het model wordt het margefilter niet toegepast (met een notitie in de uitleg).
- De batterijklasse van Vinted ("<80%", "80-85%") is een bereik en telt niet als percentage voor het batterijfilter.
