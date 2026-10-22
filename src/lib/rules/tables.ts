/**
 * Tabellen uit "Best Buy Phone Zoekfilters & Vuistregels". Alle bedragen in hele euro's.
 * Waarden zijn standaardwaarden: ze zijn allemaal aanpasbaar via Instellingen → Inkoopregels.
 */

/** Batterijconditie → extra verhoging (verlaging) van de maximale prijs, ten opzichte van 85% (= 0). */
export const BATTERY_ADJUST_EURO: Record<number, number> = {
  80: -25, 81: -20, 82: -15, 83: -10, 84: -5, 85: 0, 86: 5, 87: 10, 88: 15, 89: 20, 90: 25,
  91: 32.5, 92: 40, 93: 47.5, 94: 55, 95: 62.5, 96: 70, 97: 77.5, 98: 85, 99: 92.5, 100: 100,
};

/** [vanaf verkoopprijs, vraagprijs-marge (tabel A), vraagprijs-marge (tabel B), extra hoge marge vraagprijs, bieden-vanaf-marge, extra hoge marge bieden] */
export type MarginRow = [from: number, askA: number, askB: number, askHigh: number, bid: number, bidHigh: number];

export const MARGIN_ROWS: MarginRow[] = [
  [0, 45, 45, 20, 55, 30],
  [50, 50, 55, 25, 60, 40],
  [100, 60, 65, 25, 75, 40],
  [150, 65, 70, 30, 80, 50],
  [200, 70, 75, 30, 85, 50],
  [250, 75, 85, 30, 95, 50],
  [300, 80, 85, 35, 105, 60],
  [350, 85, 95, 40, 115, 60],
  [400, 90, 100, 45, 115, 70],
  [450, 95, 110, 50, 130, 75],
  [500, 100, 115, 50, 135, 75],
  [550, 100, 125, 50, 145, 80],
  [600, 100, 130, 50, 155, 80],
  [650, 145, 145, 50, 175, 80],
  [700, 150, 150, 60, 180, 90],
  [750, 165, 165, 60, 200, 90],
  [800, 165, 165, 70, 205, 100],
  [850, 185, 185, 70, 230, 100],
  [900, 185, 185, 90, 240, 120],
  [950, 205, 205, 90, 265, 120],
  [1000, 205, 205, 100, 270, 130],
  [1050, 225, 225, 100, 300, 130],
  [1100, 225, 225, 100, 305, 130],
  [1150, 245, 245, 105, 330, 140],
  [1200, 240, 240, 110, 325, 145],
  [1250, 255, 255, 115, 345, 150],
  [1300, 255, 255, 120, 345, 160],
  [1350, 270, 270, 130, 365, 170],
  [1400, 270, 270, 140, 365, 180],
];

/** Releasemaand per iPhone-generatie/-model (voor de batterij-aanname naar leeftijd en "nieuwste Pro/Pro Max"). */
export const IPHONE_RELEASE: Record<string, string> = {
  "iphone-11": "2019-09", "iphone-11-pro": "2019-09", "iphone-11-pro-max": "2019-09",
  "iphone-se-2": "2020-04",
  "iphone-12": "2020-10", "iphone-12-pro": "2020-10", "iphone-12-mini": "2020-11", "iphone-12-pro-max": "2020-11",
  "iphone-13": "2021-09", "iphone-13-mini": "2021-09", "iphone-13-pro": "2021-09", "iphone-13-pro-max": "2021-09",
  "iphone-se-3": "2022-03",
  "iphone-14": "2022-09", "iphone-14-pro": "2022-09", "iphone-14-pro-max": "2022-09", "iphone-14-plus": "2022-10",
  "iphone-15": "2023-09", "iphone-15-plus": "2023-09", "iphone-15-pro": "2023-09", "iphone-15-pro-max": "2023-09",
  "iphone-16": "2024-09", "iphone-16-plus": "2024-09", "iphone-16-pro": "2024-09", "iphone-16-pro-max": "2024-09",
  "iphone-16e": "2025-02",
  "iphone-17": "2025-09", "iphone-17-pro": "2025-09", "iphone-17-pro-max": "2025-09", "iphone-air": "2025-09",
};

/**
 * Waarderingslijst iPad uit het document. Dit zijn MAXIMALE INKOOPPRIJZEN (kind "buy"): daar wordt geen marge meer afgetrokken.
 * Voor iPad Air (2024, M2) bestaan maten 11 en 13 inch; dat is de `variant`. (Typfout in het document "€25§0" gelezen als €250.)
 */
export interface SeedPrice { modelKey: string; storageGb: number; variant?: string; priceEuro: number; kind: "buy" }
export const IPAD_SEED: SeedPrice[] = [
  { modelKey: "ipad-mini-6", storageGb: 64, priceEuro: 275, kind: "buy" },
  { modelKey: "ipad-mini-6", storageGb: 256, priceEuro: 350, kind: "buy" },
  { modelKey: "ipad-mini-7", storageGb: 128, priceEuro: 450, kind: "buy" },
  { modelKey: "ipad-mini-7", storageGb: 256, priceEuro: 550, kind: "buy" },
  { modelKey: "ipad-mini-7", storageGb: 512, priceEuro: 650, kind: "buy" },
  { modelKey: "ipad-9", storageGb: 64, priceEuro: 175, kind: "buy" },
  { modelKey: "ipad-9", storageGb: 256, priceEuro: 250, kind: "buy" },
  { modelKey: "ipad-10", storageGb: 64, priceEuro: 300, kind: "buy" },
  { modelKey: "ipad-10", storageGb: 256, priceEuro: 400, kind: "buy" },
  { modelKey: "ipad-air-4", storageGb: 64, priceEuro: 250, kind: "buy" },
  { modelKey: "ipad-air-4", storageGb: 256, priceEuro: 250, kind: "buy" },
  { modelKey: "ipad-air-5", storageGb: 64, priceEuro: 250, kind: "buy" },
  { modelKey: "ipad-air-5", storageGb: 256, priceEuro: 300, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 128, variant: "11", priceEuro: 550, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 256, variant: "11", priceEuro: 650, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 512, variant: "11", priceEuro: 850, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 1024, variant: "11", priceEuro: 1000, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 128, variant: "13", priceEuro: 650, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 256, variant: "13", priceEuro: 750, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 512, variant: "13", priceEuro: 950, kind: "buy" },
  { modelKey: "ipad-air-m2", storageGb: 1024, variant: "13", priceEuro: 1100, kind: "buy" },
];

export const DEFAULT_SCRATCH_FREE_PHRASES = [
  "krasvrij", "krasloos", "kraasvrij", "schadevrij", "schade vrij", "geen schade", "geen kras", "geen krassen", "geen krasjes",
  "zonder krassen", "zonder kras", "zonder krasjes", "zonder schade", "green krassen", "geen krasse", "nul krassen", "geen beschadigingen",
  "altijd in hoesje", "altijd in een hoesje", "altijd een hoesje", "altijd met hoesje", "altijd in een case", "altijd screenprotector", "altijd een screenprotector",
  "altijd met screenprotector", "altijd glas", "altijd beschermglas", "hoesje en screenprotector heeft er altijd", "screenprotector heeft er vanaf dag", "screenprotector heeft er altijd",
  "vanaf begin met screenprotector", "vanaf het begin screenprotector", "vanaf dag 1", "vanaf dag één", "vanaf dag een", "meteen bescherm glas", "meteen beschermglas", "meteen een hoesje",
  "nog folie op", "nog de folie", "folie er nog op", "zeer netjes", "als nieuw", "zo goed als nieuw", "in nieuwstaat", "nieuwstaat", "in perfecte staat", "perfecte staat", "mint condition",
  "no scratches", "scratch free", "zonder gebruikssporen", "geen gebruikssporen",
];

/** Wortels: elk woord dat hiermee begint telt als krassen/schade (na het weghalen van "krasvrij"-uitdrukkingen). */
export const DEFAULT_SCRATCH_PHRASES = [
  "kras", "gekrast", "haarlijn", "schram", "gebruikssporen", "gebruiksporen", "slijtage", "slijtplek", "deukje", "deuk", "stootje", "beschadigd", "cosmetische", "scratch",
];

export const NEWEST_RELEASE_LOOKBACK_MONTHS = 12;
