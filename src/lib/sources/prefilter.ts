import { recognizeByRules } from "../engines/recognition";
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

export function buildPrefilter(tree: Group, opts: { accessories?: AccessoryConfig; onDrop?: (reason: string) => void } = {}): ((ad: RawAd) => boolean) | undefined {
  if (tree.op !== "AND") return undefined;
  let maxEuro: number | null = null;
  let models: string[] | null = null;
  for (const n of tree.children) {
    if (isGroup(n)) continue;
    if (n.field === "askingEuro" && n.operator === "lte" && typeof n.value === "number") maxEuro = maxEuro == null ? n.value : Math.min(maxEuro, n.value);
    if (n.field === "modelKey" && n.operator === "in" && Array.isArray(n.value) && n.value.length) models = (n.value as string[]).map((m) => m.toLowerCase());
  }
  return (ad) => {
    const noise = noiseReason(ad, opts.accessories);
    if (noise) { opts.onDrop?.(noise); return false; }
    if (maxEuro != null && ad.askingCents != null && ad.askingCents > 0 && ad.askingCents / 100 > maxEuro) return false;
    if (models) {
      const r = recognizeByRules({ title: ad.title, description: ad.description, structured: ad.attributes ?? null });
      if (r.confidence >= 0.6 && r.family !== "unknown" && !models.includes(r.modelKey)) return false;
    }
    return true;
  };
}
