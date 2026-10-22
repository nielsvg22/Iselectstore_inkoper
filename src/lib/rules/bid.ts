import type { RulesConfig } from "./config";

export interface BidAssessment {
  /** de prijs waarmee gerekend wordt (euro) */
  effectiveEuro: number;
  /** was de bieden-vanaf-prijs geloofwaardig (door de verkoper bedacht)? */
  realistic: boolean;
  adjusted: boolean;
  note: string;
}

/**
 * Marktplaats zet "bieden vanaf" automatisch op ±60% van de vraagprijs. Onder 65% van de vraagprijs, of bij een gat boven
 * het maximum, rekenen we met het gemiddelde: de verkoper gaat er nooit voor weg.
 */
export function assessBid(askEuro: number, bidEuro: number, cfg: RulesConfig["bid"]): BidAssessment {
  if (askEuro <= 0) return { effectiveEuro: bidEuro, realistic: true, adjusted: false, note: "Alleen bieden vanaf bekend" };
  if (bidEuro >= askEuro) return { effectiveEuro: askEuro, realistic: true, adjusted: false, note: "Bieden vanaf gelijk aan vraagprijs" };
  const share = bidEuro / askEuro;
  const gap = askEuro - bidEuro;
  if (share < cfg.minShareOfAsk || gap > cfg.maxGapEuro) {
    const avg = Math.round((askEuro + bidEuro) / 2);
    const why = share < cfg.minShareOfAsk ? `bieden vanaf is ${Math.round(share * 100)}% van de vraagprijs (door Marktplaats ingevuld)` : `gat van €${Math.round(gap)} tussen vraag en bieden vanaf`;
    return { effectiveEuro: avg, realistic: false, adjusted: true, note: `Gemiddelde €${avg} gebruikt: ${why}` };
  }
  return { effectiveEuro: bidEuro, realistic: true, adjusted: false, note: "Bieden vanaf is realistisch" };
}
