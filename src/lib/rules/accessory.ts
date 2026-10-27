/**
 * Herkent advertenties die over een accessoire, onderdeel of lege doos gaan in plaats van het apparaat zelf.
 * Combineert titel, omschrijving, de herkende opslag en de prijs: "iPhone 15 Pro inclusief hoesje" blijft een telefoon,
 * "iPhone 15 Pro hoesje" of "Hoesje voor iPhone 15 Pro" niet. Alle woordenlijsten zijn instelbaar.
 */

export const DEFAULT_ACCESSORY_TERMS = [
  "hoesje", "hoes", "telefoonhoesje", "case", "cover", "bumper", "backcover", "flipcase", "bookcase", "sleeve", "etui",
  "screenprotector", "screen protector", "beschermglas", "tempered glass", "glasplaatje", "screenguard", "folie", "displayfolie",
  "oplader", "lader", "adapter", "kabel", "oplaadkabel", "lightning kabel", "usb-c kabel", "powerbank", "charger", "cable",
  "houder", "standaard", "autohouder", "armband", "polsband", "horlogebandje", "bandje", "strap", "lanyard", "ringhouder", "popsocket",
  "stylus", "toetsenbordhoes", "oordopjes hoesje",
];

export const DEFAULT_PARTS_TERMS = [
  "onderdelen", "voor onderdelen", "losse onderdelen", "onderdeel", "alleen doos", "alleen de doos", "lege doos", "lege verpakking", "doos zonder",
  "moederbord", "logicboard", "logic board", "backglass", "flexkabel", "dummy", "nepmodel", "nep ", "display model nep", "vervangend scherm",
];

export const DEFAULT_INCLUDE_MARKERS = ["inclusief", "incl", "incl.", "met", "+", "plus", "compleet met", "geleverd met", "komt met", "inclusief originele", "samen met"];
export const DEFAULT_WITHOUT_MARKERS = ["zonder", "geen", "excl", "exclusief", "los van"];

export interface AccessoryConfig {
  enabled: boolean;
  terms: string[];
  partsTerms: string[];
  includeMarkers: string[];
  withoutMarkers: string[];
  /** zonder opslag-aanduiding en onder dit bedrag (of de minimumprijs van het zoekfilter) geldt een accessoire-woord in de titel als bewijs */
  minDevicePriceEuro: number;
  /** ook "defect"/"kapot" uitsluiten (uit: de conditie-filters van de modellenlijst bepalen dat) */
  excludeDefect: boolean;
}

export interface AccessoryInput {
  title: string;
  description: string;
  /** prijs in euro (vraagprijs, anders bieden vanaf) */
  priceEuro: number | null;
  /** opslag uit titel/omschrijving herkend */
  storageGb: number | null;
  /** minimumprijs van het zoekfilter voor dit model (0 = onbekend) */
  filterMinEuro: number;
}

export type AccessoryVerdict = { accessory: false; note?: string } | { accessory: true; kind: "accessoire" | "onderdeel" | "defect"; term: string; reason: string };

const norm = (s: string) => s.toLowerCase().replace(/[‘’´`]/g, "'").replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Zoekt `term` als los woord (of woorddeel aan het eind, zodat "iphonehoesje" ook telt) en geeft de positie terug. */
function findTerm(text: string, term: string): number {
  const t = norm(term);
  if (!t) return -1;
  const re = new RegExp(`(?<![a-z0-9])(?:[a-z0-9]{0,12})?${esc(t)}(?:s|en)?(?![a-z0-9])`, "g");
  const m = re.exec(text);
  return m ? m.index : -1;
}

/** Staat er vlak vóór de term een "inclusief/met"-woord (of "zonder")? */
function markerBefore(text: string, idx: number, markers: string[]): boolean {
  const before = text.slice(Math.max(0, idx - 40), idx);
  return markers.some((m) => new RegExp(`(?:^|[^a-z0-9])${esc(norm(m))}\\s*(?:[a-z0-9'.,-]+\\s+){0,3}$`).test(before));
}

export function classifyAccessory(i: AccessoryInput, cfg: AccessoryConfig): AccessoryVerdict {
  if (!cfg.enabled) return { accessory: false };
  const title = norm(i.title);
  const desc = norm(i.description).slice(0, 1500);
  const price = i.priceEuro;

  // onderdelen / lege doos: altijd uitsluiten, tenzij het expliciet "zonder/geen onderdelen" is
  for (const term of cfg.partsTerms) {
    const idx = findTerm(title, term);
    if (idx >= 0 && !markerBefore(title, idx, cfg.withoutMarkers)) return { accessory: true, kind: "onderdeel", term, reason: `"${term.trim()}" in de titel: onderdeel of lege doos, niet het apparaat` };
  }
  if (cfg.excludeDefect) {
    const m = /(?<![a-z0-9])(defect|kapot|niet werkend|werkt niet)(?![a-z0-9])/.exec(title);
    if (m) return { accessory: true, kind: "defect", term: m[1], reason: `"${m[1]}" in de titel: defect apparaat` };
  }

  // accessoire-woorden in de titel
  const hits: Array<{ term: string; idx: number }> = [];
  for (const term of cfg.terms) {
    const idx = findTerm(title, term);
    if (idx >= 0) hits.push({ term, idx });
  }
  if (!hits.length) return { accessory: false };
  const standalone = hits.filter((h) => !markerBefore(title, h.idx, cfg.includeMarkers) && !markerBefore(title, h.idx, cfg.withoutMarkers));
  if (!standalone.length) return { accessory: false, note: `Accessoire "${hits[0].term}" wordt meegeleverd bij het apparaat` };
  const hit = standalone[0];
  // "hoesje voor iPhone 15 Pro", "case geschikt voor iPad": altijd een accessoire
  if (new RegExp(`${esc(norm(hit.term))}\\w*\\s+(?:voor|for|geschikt voor|passend op|compatible)`).test(title))
    return { accessory: true, kind: "accessoire", term: hit.term, reason: `"${hit.term}" voor een apparaat: accessoire` };
  // apparaat + accessoire-woord als laatste woord ("iPhone 15 Pro hoesje")
  const endsWithTerm = new RegExp(`${esc(norm(hit.term))}\\w*[\\s.,!)]*$`).test(title);
  const hasStorage = i.storageGb != null && /(?<![0-9])\d{2,4}\s?(gb|tb)(?![a-z])/i.test(`${title} ${desc}`);
  const floor = i.filterMinEuro > 0 ? i.filterMinEuro : cfg.minDevicePriceEuro;
  const cheap = price != null && price > 0 && price < floor;
  if (endsWithTerm && !hasStorage) return { accessory: true, kind: "accessoire", term: hit.term, reason: `Titel eindigt op "${hit.term}" zonder opslag: accessoire` };
  if (cheap && !hasStorage) return { accessory: true, kind: "accessoire", term: hit.term, reason: `"${hit.term}" in de titel, geen opslag en prijs €${price} onder €${floor}: accessoire` };
  if (cheap && endsWithTerm) return { accessory: true, kind: "accessoire", term: hit.term, reason: `Titel eindigt op "${hit.term}" en prijs €${price} onder €${floor}: accessoire` };
  return { accessory: false, note: `Titel noemt "${hit.term}", maar opslag en prijs wijzen op het apparaat` };
}
