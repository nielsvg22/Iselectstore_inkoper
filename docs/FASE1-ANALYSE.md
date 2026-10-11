# Fase 1 – Analyse van de bestaande Apple Deal Hunter (stand 2026-10-11)

## Werkt
| Onderdeel | Bevinding |
|---|---|
| Zoeken op Marktplaats | `marktplaats-search.ts`: publieke `/q/<term>/` en `/l/<cat>/q/<term>/p/N/`-pagina's (robots.txt-conform), data uit `__NEXT_DATA__`, 3 s pacing, geen omzeiling. |
| Jobwachtrij | DB-queue met `FOR UPDATE SKIP LOCKED`, prioriteit, retries met backoff, herstel van vastgelopen jobs. |
| Worker | `src/worker/run.ts` (Coolify): tick elke 20 s. |
| Herkenning/waardering/winst/score/risico | Regelgebaseerd + optionele AI; uitlegbaar; risicoblokkades (iCloud/MDM/gestolen/defect). |
| Filterengine | AND/OR-boom, 20+ velden (afstand, batterij, verzending, winst, score, risico …), opgeslagen filters, profiel-regels, `profile-quick.ts`. |
| Meldingen | Telegram + Discord, dedupe-sleutel per kanaal/advertentie/profiel, retries. |
| Dedupe advertenties | Fingerprint + titel/foto/prijs-overeenkomst. |

## Gedeeltelijk
| Onderdeel | Probleem |
|---|---|
| Snelheid | Detailpagina's (tot 40 × 3 s) worden **binnen** de zoekrun opgehaald vóór ingest ⇒ nieuwe advertenties wachten minuten op opname. Minimuminterval 30 min. Elk profiel haalt dezelfde zoekpagina's opnieuw op. |
| Scheduler | Eén job tegelijk; geen gedeelde cache tussen profielen; Vercel-cron draait 1×/dag (`0 6 * * *`) ⇒ op Vercel feitelijk dagelijks. |
| Meldingsdrempel | Alleen score/band; geen minimale winst, stilteperiode, per-apparaat, "volledig beoordeeld"-eis. |
| Afstand/verzending | Filterveld bestaat; geen beleid "ver weg ⇒ alleen met verzending", geen verzend-/transportkosten in winst bij afstand. |
| Batterij | Herkenning + filter + lage-batterij-vlag; geen beleid voor onbekend, geen vervangingskosten/prijscorrectie. |
| Verkoper | Alleen `isVerified` uit zoekresultaten. |

## Ontbreekt
- PWA (manifest, service worker, iconen, installatiehandleiding), Web Push (VAPID, subscriptions, test-push).
- Tijdmetingen per stap (detectie → analyse → melding → verzonden), dashboard met percentielen.
- Verkopersbetrouwbaarheidsscore met herkomst van gegevens.
- "Test filters op bestaande advertenties" met per-voorwaarde uitleg.

## Wat Marktplaats feitelijk levert (live gecontroleerd 2026-10-11)
- `robots.txt`: geen `Crawl-delay`; verboden: `/lrp/api/search*`, `/lp/api/listings*`, `/search?q=*` e.a. Toegestaan: `/q/…`, `/l/…`, `/v/…`, `/p/N/`.
- De sortering "nieuwste eerst" (`SORT_INDEX`) bestaat alleen als **client-side URL-fragment** of in de verboden API; een query-parameter wordt door de server genegeerd (vergeleken: identieke resultaten). De server-gerenderde pagina gebruikt `OPTIMIZED`, waarin betaalde "dagtoppers" vooraan staan en oudere advertenties door nieuwe heen lopen. **Nieuwste-eerst is dus via toegestane pagina's niet af te dwingen**; detectie hangt af van (a) specifieke zoektermen/categorieën en (b) meerdere pagina's per run.
- Verkopersgegevens in zoekresultaten: `sellerId` (anoniem = 1), `sellerName` ("Anoniem"), `isVerified`, trait `VERIFIED_SELLER` (zakelijk). **Geen** beoordelingen, accountleeftijd of verkoopverleden. Die blijven dus "Onbekend".
- Publicatiedatum is grof ("Vandaag", "Gisteren", datum) – niet geschikt voor exacte vertraging; daarom meten we **eerste detectie door onze scraper** (`firstSeenAt`).
- Officiële/geautoriseerde bron voor snellere detectie: er is (bij ons bekend) geen publieke Marktplaats-API voor zoeken; een geautoriseerde feed/partnerintegratie moet met Marktplaats worden afgesproken. Tot die tijd is polling de enige toegestane methode.

## Gevolgen voor het ontwerp
1. Ingest eerst (alleen zoekresultaat), detail asynchroon; melding pas na volledige beoordeling.
2. Gedeelde paginacache + gedeelde queries over profielen; per-host pacing blijft gelden.
3. Minimuminterval configureerbaar (standaard 10 min, harde ondergrens 5 min); geen garantie op realtime.
4. Worker op Coolify is de primaire scheduler; Vercel-cron blijft alleen vangnet.
