import type { AppConfig } from "@/lib/config/schema";

export interface CostInputs {
  repairCents: number;
  shippingCents: number;
  transportCents: number;
  otherCents: number;
  platformFeePct: number;
  transactionFeePct: number;
}

export interface TaxInputs {
  vatMode: "none" | "standard" | "margin";
  vatRatePct: number;
  marginSchemeEligible: boolean;
}

export interface ProfitBreakdown {
  saleCents: number;
  buyCents: number;
  vatCents: number;
  vatBasis: "none" | "standard" | "margin";
  platformFeeCents: number;
  transactionFeeCents: number;
  repairCents: number;
  shippingCents: number;
  transportCents: number;
  otherCents: number;
  totalCostsCents: number; // alle kosten behalve inkoop, incl. btw
  netProfitCents: number;
  grossMarginPct: number;
  netMarginPct: number;
  roiPct: number; // netto winst / inkoopprijs
  lines: Array<{ label: string; cents: number }>;
}

/** Effectieve btw-behandeling: margeregeling alleen wanneer de gebruiker bevestigt dat deze van toepassing is. */
export function effectiveVatBasis(tax: TaxInputs): "none" | "standard" | "margin" {
  if (tax.vatMode === "none") return "none";
  if (tax.vatMode === "margin") return tax.marginSchemeEligible ? "margin" : "standard";
  return "standard";
}

export function calcProfit(buyCents: number, saleCents: number, costs: CostInputs, tax: TaxInputs): ProfitBreakdown {
  const basis = effectiveVatBasis(tax);
  const r = tax.vatRatePct / 100;
  let vat = 0;
  if (basis === "standard") vat = Math.round((saleCents * r) / (1 + r));
  if (basis === "margin") vat = Math.round((Math.max(0, saleCents - buyCents) * r) / (1 + r));
  const platformFee = Math.round((saleCents * costs.platformFeePct) / 100);
  const txFee = Math.round((saleCents * costs.transactionFeePct) / 100);
  const fixed = costs.repairCents + costs.shippingCents + costs.transportCents + costs.otherCents;
  const totalCosts = vat + platformFee + txFee + fixed;
  const net = saleCents - buyCents - totalCosts;
  const lines = [
    { label: "Verkoopopbrengst", cents: saleCents },
    { label: "Inkoopprijs", cents: -buyCents },
    ...(vat ? [{ label: basis === "margin" ? "Btw (margeregeling)" : "Btw over verkoop", cents: -vat }] : []),
    ...(costs.repairCents ? [{ label: "Reparatiekosten", cents: -costs.repairCents }] : []),
    ...(costs.shippingCents ? [{ label: "Verzendkosten", cents: -costs.shippingCents }] : []),
    ...(costs.transportCents ? [{ label: "Transportkosten", cents: -costs.transportCents }] : []),
    ...(platformFee ? [{ label: `Platformkosten (${costs.platformFeePct}%)`, cents: -platformFee }] : []),
    ...(txFee ? [{ label: `Transactiekosten (${costs.transactionFeePct}%)`, cents: -txFee }] : []),
    ...(costs.otherCents ? [{ label: "Overige kosten", cents: -costs.otherCents }] : []),
  ];
  return {
    saleCents,
    buyCents,
    vatCents: vat,
    vatBasis: basis,
    platformFeeCents: platformFee,
    transactionFeeCents: txFee,
    repairCents: costs.repairCents,
    shippingCents: costs.shippingCents,
    transportCents: costs.transportCents,
    otherCents: costs.otherCents,
    totalCostsCents: totalCosts,
    netProfitCents: net,
    grossMarginPct: saleCents > 0 ? ((saleCents - buyCents) / saleCents) * 100 : 0,
    netMarginPct: saleCents > 0 ? (net / saleCents) * 100 : 0,
    roiPct: buyCents > 0 ? (net / buyCents) * 100 : 0,
    lines,
  };
}

/** Minimale verkoopprijs om `minProfitCents` netto te verdienen bij gegeven inkoop. */
export function minSalePrice(buyCents: number, costs: CostInputs, tax: TaxInputs, minProfitCents: number): number {
  let lo = 0;
  let hi = 100_000_00;
  for (let i = 0; i < 60; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (calcProfit(buyCents, mid, costs, tax).netProfitCents >= minProfitCents) hi = mid;
    else lo = mid + 1;
    if (lo >= hi) break;
  }
  return lo;
}

/** Hoogste inkoopprijs waarbij zowel minimale winst als minimaal rendement gehaald worden. */
export function maxBuyPrice(saleCents: number, costs: CostInputs, tax: TaxInputs, minProfitCents: number, minRoiPct: number): number {
  const ok = (buy: number) => {
    const p = calcProfit(buy, saleCents, costs, tax);
    return p.netProfitCents >= minProfitCents && (buy === 0 || p.roiPct >= minRoiPct);
  };
  if (!ok(0)) return 0;
  let lo = 0;
  let hi = Math.max(saleCents, 1);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function costsFromConfig(cfg: AppConfig, overrides?: Partial<CostInputs> & { repairCents?: number }): CostInputs {
  return {
    repairCents: overrides?.repairCents ?? 0,
    shippingCents: overrides?.shippingCents ?? cfg.costs.shippingCents,
    transportCents: overrides?.transportCents ?? cfg.costs.transportCents,
    otherCents: overrides?.otherCents ?? cfg.costs.otherCents,
    platformFeePct: overrides?.platformFeePct ?? cfg.costs.platformFeePct,
    transactionFeePct: overrides?.transactionFeePct ?? cfg.costs.transactionFeePct,
  };
}

export function taxFromConfig(cfg: AppConfig, marginEligibleOverride?: boolean): TaxInputs {
  return {
    vatMode: cfg.tax.vatMode,
    vatRatePct: cfg.tax.vatRatePct,
    marginSchemeEligible: marginEligibleOverride ?? cfg.tax.marginSchemeEligible,
  };
}
