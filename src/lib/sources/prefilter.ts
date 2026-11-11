import { recognizeByRules } from "../engines/recognition";
import { belowMinIphone, minPriceEuro } from "../rules/release";
import type { RulesConfig } from "../rules/config";
import { classifyAccessory, type AccessoryConfig } from "../rules/accessory";
import { isGroup, type Group } from "../engines/filters";
import type { RawAd } from "./types";

/**
 * Haalt koopadvertenties en losse accessoires weg en maakt van de bovenste AND-regels van een zoekprofiel een goedkope voorselectie
 * (maximale prijs, modellen) zodat niet elke gevonden advertentie wordt opgeslagen/geanalyseerd.
 * Alleen zekere uitsluitingen: onbekende prijs of onzekere herkenning komt altijd door.
 */
// Advertenties die geen te koop aangeboden toestel zijn: koopadvertenties ("gezocht", "inkoop") …
const BUYING = /\b(gezocht|gezocht en gekocht|wij kopen|ik koop|inkoop van|direct cash|cash voor)\b/i;
// … en losse accessoires, tenzij er duidelijk een opslagvariant/toestel wordt aangeboden
const ACCESSORY = /\b(hoesje|hoes|case|screenprotector|beschermglas|beschermer|beschermers|lens|oplader|kabel|houder|standaard|armband|bandje|sticker|folie)\b/i;

/** Waarom een advertentie bij het ophalen al wordt weggelaten (null = doorlaten). Met `accessories` gebruikt dit de instelbare herkenning van de inkoopregels, anders de vaste lijst. */
export function noiseReason(ad: RawAd, accessories?: AccessoryConfig): "buying" | "accessory" | null {
  if (BUYING.test(ad.title)) return "buying";
  if (accessories) {
    if (!accessories.enabled) return null;
    const r = recognizeByRules({ title: ad.title, description: ad.description ?? "" });
    const storage = r.facts.storageGb?.value;
    const price = ad.askingCents != null && ad.askingCents > 0 ? ad.askingCents / 100 : null;
    return classifyAccessory({ title: ad.title, description: ad.description ?? "", priceEuro: price, storageGb: typeof storage === "number" ? storage : null, filterMinEuro: 0 }, accessories).accessory ? "accessory" : null;
  }
  if (ACCESSORY.test(ad.title)) {
    const r = recognizeByRules({ title: ad.title, description: "" });
    if (!r.facts.storageGb) return "accessory";
  }
  return null;
}

export function isNoise(ad: RawAd, accessories?: AccessoryConfig): boolean {
  return noiseReason(ad, accessories) != null;
}

/** Wat de klant wil: alleen modellen uit de modellenlijst (null = geen lijst) en iPhones vanaf een generatie (0 = alle). */
export interface PrefilterScope {
  allowedModelKeys?: ReadonlySet<string> | null;
  minIphoneGeneration?: number;
  /** minimumprijzen: een vaste vraagprijs eronder (hoesje, kabel) komt er niet in; "bieden vanaf" telt niet mee */
  minPrice?: RulesConfig["minPrice"];
}
/** Woorden die erop wijzen dat het om een Apple-product gaat; zonder herkend model en zonder zo'n woord is het geen Apple (bijv. een slimme ring). */
const APPLE_WORD = /\b(iphone|ipad|macbook|imac|mac\s?mini|mac\s?studio|apple|airpods?|ipod)\b/i;
const FIXED_PRICE = new Set(["FIXED", undefined, ""]);

export function buildPrefilter(tree: Group, opts: { accessories?: AccessoryConfig; scope?: PrefilterScope; onDrop?: (reason: string) => void } = {}): ((ad: RawAd) => boolean) | undefined {
  // bij een OR-profiel gelden de prijs- en modelgrenzen van het profiel niet, maar ruis en de wensen van de klant (lijst, generatie, minimumprijs) wel
  const isAnd = tree.op === "AND";
  if (!isAnd && !opts.scope && !opts.accessories) return undefined;
  let maxEuro: number | null = null;
  let models: string[] | null = null;
  for (const n of isAnd ? tree.children : []) {
    if (isGroup(n)) continue;
    if (n.field === "askingEuro" && n.operator === "lte" && typeof n.value === "number") maxEuro = maxEuro == null ? n.value : Math.min(maxEuro, n.value);
    if (n.field === "modelKey" && n.operator === "in" && Array.isArray(n.value) && n.value.length) models = (n.value as string[]).map((m) => m.toLowerCase());
  }
  return (ad) => {
    const noise = noiseReason(ad, opts.accessories);
    if (noise) { opts.onDrop?.(noise); return false; }
    if (opts.scope) {
      const r = recognizeByRules({ title: ad.title, description: ad.description, structured: ad.attributes ?? null });
      const known = r.confidence >= 0.6 && r.family !== "unknown";
      if (!known && !APPLE_WORD.test(`${ad.title} ${ad.description ?? ""}`)) { opts.onDrop?.("geen-apple-product"); return false; }
      const pt = ad.attributes?.priceType;
      if (opts.scope.minPrice && ad.askingCents != null && ad.askingCents > 0 && FIXED_PRICE.has(typeof pt === "string" ? pt : undefined)) {
        const min = Math.max(opts.scope.minPrice.globalEuro, known ? minPriceEuro(r.modelKey, r.family, opts.scope.minPrice) : 0);
        if (min > 0 && ad.askingCents / 100 < min) { opts.onDrop?.("onder-minimumprijs"); return false; }
      }
      if (known) {
        if (belowMinIphone(r.modelKey, r.family, opts.scope.minIphoneGeneration ?? 0)) { opts.onDrop?.("iphone-te-oud"); return false; }
        if (opts.scope.allowedModelKeys && !opts.scope.allowedModelKeys.has(r.modelKey)) { opts.onDrop?.("buiten-modellenlijst"); return false; }
      }
    }
    if (maxEuro != null && ad.askingCents != null && ad.askingCents > 0 && ad.askingCents / 100 > maxEuro) return false;
    if (models) {
      const r = recognizeByRules({ title: ad.title, description: ad.description, structured: ad.attributes ?? null });
      if (r.confidence >= 0.6 && r.family !== "unknown" && !models.includes(r.modelKey)) return false;
    }
    return true;
  };
}
