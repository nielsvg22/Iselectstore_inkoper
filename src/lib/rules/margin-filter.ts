import type { RulesConfig } from "./config";

export interface MarginCosts { shippingEuro: number; protectionPct: number; protectionFixedEuro: number; otherEuro: number }

export interface MarginInput {
  platform: string;
  /** inkoopprijs in euro (vraagprijs, anders bieden vanaf) */
  purchaseEuro: number;
  /** verwachte doorverkoopprijs uit de modellenlijst */
  resaleEuro: number;
  /** minimale marge uit de modellenlijst voor dit model; leeg = per verkoopprijssegment */
  modelMinMarginEuro: number | null;
  /** werkelijke kosten die het platform in de advertentie noemt (centen); worden gebruikt als ze er zijn */
  listedProtectionCents?: number | null;
  listedShippingCents?: number | null;
}

export interface MarginResult {
  resaleEuro: number;
  purchaseEuro: number;
  costsEuro: number;
  profitEuro: number;
  requiredEuro: number;
  /** hoogste inkoopprijs waarbij de gewenste marge nog gehaald wordt (kosten meegerekend) */
  maxPurchaseEuro: number;
  ok: boolean;
  costLines: Array<{ label: string; euro: number }>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Marge in de volgorde van de klant: verwachte winst = doorverkoopprijs − inkoopprijs − bijkomende kosten. */
export function marginFor(i: MarginInput, cfg: RulesConfig["margin"]): MarginResult {
  const c: MarginCosts = cfg.costs[i.platform === "vinted" ? "vinted" : "marktplaats"];
  const useListed = i.platform === "vinted" && cfg.useListedPlatformCosts;
  const lines: Array<{ label: string; euro: number }> = [];
  const shipping = useListed && i.listedShippingCents != null ? i.listedShippingCents / 100 : c.shippingEuro;
  if (shipping) lines.push({ label: useListed && i.listedShippingCents != null ? "Verzendkosten (volgens Vinted)" : "Verzendkosten", euro: r2(shipping) });
  const protection = useListed && i.listedProtectionCents != null ? i.listedProtectionCents / 100 : (c.protectionPct / 100) * i.purchaseEuro + c.protectionFixedEuro;
  if (protection) lines.push({ label: useListed && i.listedProtectionCents != null ? "Kopersbescherming (volgens Vinted)" : "Kopersbescherming", euro: r2(protection) });
  if (c.otherEuro) lines.push({ label: "Overige inkoopkosten", euro: r2(c.otherEuro) });
  const costs = r2(shipping + protection + c.otherEuro);
  const segment = [...cfg.segments].sort((a, b) => b.fromResaleEuro - a.fromResaleEuro).find((s) => i.resaleEuro >= s.fromResaleEuro);
  const required = i.modelMinMarginEuro ?? segment?.minMarginEuro ?? cfg.defaultMinMarginEuro;
  const profit = r2(i.resaleEuro - i.purchaseEuro - costs);
  // protectie met percentage hangt van de prijs af: maximale inkoop = (verkoop − marge − vaste kosten) / (1 + pct)
  const fixed = shipping + c.otherEuro + (useListed && i.listedProtectionCents != null ? protection : c.protectionFixedEuro);
  const pct = useListed && i.listedProtectionCents != null ? 0 : c.protectionPct / 100;
  const maxPurchase = r2((i.resaleEuro - required - fixed) / (1 + pct));
  return { resaleEuro: i.resaleEuro, purchaseEuro: i.purchaseEuro, costsEuro: costs, profitEuro: profit, requiredEuro: required, maxPurchaseEuro: maxPurchase, ok: profit >= required, costLines: lines };
}
