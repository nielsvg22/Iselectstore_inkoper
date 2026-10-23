import type { RulesConfig } from "./config";
import type { StepId, Verdict } from "./verdict";

const eur = (n: number) => `€${n}`;
const jr = (m: number) => `${Math.round((m / 12) * 10) / 10} jaar`;

export interface StepDef {
  id: StepId | "calc" | "verdict";
  title: string;
  /** Uitleg met de waarden uit de huidige instellingen */
  rule: (c: RulesConfig) => string;
  /** wat er gebeurt als de stap "ja" zegt */
  onFail: "afwijzen" | "controleren" | "bestaande waardering" | "rekenen";
}

/** Alle stappen in de volgorde waarin de regelmotor ze doorloopt. Waarden komen uit de actuele instellingen. */
export const STEPS: StepDef[] = [
  { id: "intel", title: "Intel-Mac?", onFail: "afwijzen", rule: (c) => (c.macbook.excludeIntel ? "Macs met een Intel-chip worden uitgesloten (alleen Apple-chip, vanaf M1)." : "Intel-Macs worden niet uitgesloten.") },
  { id: "macbook-air", title: "MacBook Air binnen de ingestelde varianten?", onFail: "afwijzen", rule: (c) => `Chips ${c.macbook.airChips.join(", ")}, schermen ${c.macbook.airScreens.join(" en ")}″, RAM ${c.macbook.ramGb.join("/")} GB, SSD ${c.macbook.ssdGb.join("/")} GB. Onbekende waarden worden niet afgewezen.` },
  { id: "battery-min", title: "Batterij onder het minimum?", onFail: "afwijzen", rule: (c) => `Batterij onder ${c.battery.excludeBelowPct}% wordt nooit gekocht.` },
  { id: "distance-pickup-only", title: "Verzending uit: buiten het ophaalgebied?", onFail: "afwijzen", rule: (c) => (c.distance.includeShipping ? "Niet van toepassing: verzending staat aan." : `Verzending staat uit: alles verder dan ${c.distance.pickupMaxKm} km hemelsbreed valt af, ook bij een perfecte verkoper.`) },
  { id: "distance-max", title: "Verder dan het maximum?", onFail: "afwijzen", rule: (c) => `Maximaal ${c.distance.maxKmDefault} km; nieuwste Pro/Pro Max maximaal ${c.distance.newestProMaxKm} km.` },
  { id: "distance-no-shipping", title: "Verder dan ophalen: biedt de verkoper verzending aan?", onFail: "afwijzen", rule: (c) => `Verder dan ${c.distance.pickupMaxKm} km moet de advertentie verzending aanbieden.` },
  { id: "seller-shipping", title: "Voldoet de verkoper aan het verzendfilter?", onFail: "afwijzen", rule: (c) => `${c.shipping.tiers.map((t) => `vanaf ${jr(t.fromMonths)}: ${t.minReviews}+ reviews, ${String(t.minRating).replace(".", ",")}★${t.requireVerified ? ", ID" : ""}`).join(" · ")}. Onder ${jr(c.shipping.neverBelowMonths)} nooit. Ontbrekende gegevens: handmatig controleren.` },
  { id: "distance-unknown", title: "Afstand bekend?", onFail: "controleren", rule: (c) => (c.distance.includeShipping ? "Onbekende afstand: wordt gemarkeerd." : `Verzending staat uit: een onbekende afstand kan niet binnen ${c.distance.pickupMaxKm} km worden bewezen, dus handmatig controleren.`) },
  { id: "filter", title: "Past de advertentie bij een zoekfilter?", onFail: "afwijzen", rule: (c) => (c.filters.enabled ? `Model, opslag en conditie (normaal/kapot/sealed) moeten in de lijst met zoekfilters staan; de prijs, afstand, type advertentie en verkoper-actief van die regel gelden. ${c.filters.outsideList === "reject" ? "Een model buiten de lijst wordt afgewezen." : "Een model buiten de lijst valt onder de gewone regels."}` : "Zoekfilters staan uit.") },
  { id: "base-price", title: "Basisprijs voor dit model en deze opslag?", onFail: "bestaande waardering", rule: (c) => (c.unknownBase === "skip" ? "Zonder basisprijs wordt de advertentie afgewezen." : "Zonder basisprijs beslist de bestaande waardering (de regels geven dan geen oordeel).") },
  { id: "calc", title: "Maximale prijs berekenen", onFail: "rekenen", rule: (c) => (c.priceBase === "sell" ? `Basisprijs (perfecte staat) − batterij − kras (onbekend −${eur(c.scratch.unknownEuro)}, met krassen −${eur(c.scratch.scratchedEuro)}) ± RAM/cellular/dichtbij − rijfilter (${eur(c.distance.perKmEuro)}/km zonder verzendfilter).` : `Basisprijs (max inkoop bij 85%) + batterijtabel + krasvrij +${eur(c.scratch.freeBonusEuro)} ± RAM/cellular/dichtbij − rijfilter.`) },
  { id: "bid-zero", title: "Bieden vanaf €0 zonder prijs: toch interessant?", onFail: "afwijzen", rule: (c) => `Alleen bij batterij ${c.bid.zeroBid.minBatteryPct}%+ (aantoonbaar), ${c.bid.zeroBid.requireScratchFree ? "krasvrij, " : ""}en een betrouwbare verkoper of binnen ${c.bid.zeroBid.requireTrustedOrNearKm} km. Modus: ${c.bid.zeroBidMode === "filter" ? "afwijzen" : "alleen markeren"}.` },
  { id: "price-unknown", title: "Prijs bekend?", onFail: "controleren", rule: () => "Zonder vraagprijs of bieden-vanaf (ook niet uit de tekst) kan de prijs niet worden beoordeeld." },
  { id: "min-price", title: "Boven de minimumprijs?", onFail: "afwijzen", rule: (c) => `Nieuwere modellen minimaal ${eur(c.minPrice.newerEuro)}, oudere ${eur(c.minPrice.olderEuro)} (filtert hoesjes en accessoires).` },
  { id: "price-too-high", title: "Prijs binnen de toegestane vraagprijs of bieden vanaf?", onFail: "afwijzen", rule: (c) => `Toegestane prijs = maximale prijs − marge (tabel ${c.marginTable}). Bieden vanaf onder ${Math.round(c.bid.minShareOfAsk * 100)}% van de vraagprijs of een gat boven ${eur(c.bid.maxGapEuro)} telt als het gemiddelde.` },
  { id: "stock", title: "Voorraadregel", onFail: "afwijzen", rule: (c) => (c.stock.enabled ? `Vanaf ${c.stock.baseThreshold} op voorraad (hoger bij hogere omloopsnelheid) alleen nog deals met hoge marge.` : "Staat uit.") },
  { id: "verdict", title: "Uitkomst", onFail: "rekenen", rule: (c) => `💰 hoge marge als de prijs ook onder de hoge-marge-grens ligt en alles bekend is (minimaal ${eur(c.highMargin.minAskMarginEuro)} marge op vraagprijs, ${eur(c.highMargin.minBidMarginEuro)} op bieden vanaf); anders "voldoet".` },
];

export type StepState = "passed" | "decided" | "not-reached";
export interface StepTrace { id: StepDef["id"]; title: string; rule: string; state: StepState; outcome?: string }

/**
 * Per stap: doorlopen (passed), bepalend voor de uitkomst (decided) of niet bereikt (not-reached).
 * Afgeleid uit het oordeel: de stap in `decidedBy` beslist, alles daarvoor is doorlopen, alles daarna niet bereikt.
 */
export function traceSteps(v: Verdict, cfg: RulesConfig): StepTrace[] {
  const stop = v.decidedBy;
  const stopIdx = stop ? STEPS.findIndex((s) => s.id === stop) : -1;
  // bij "handmatig controleren" om afstand of verkoper loopt de beoordeling gewoon door: latere stappen zijn doorlopen
  const continues = v.status === "review" && (stop === "distance-unknown" || stop === "seller-shipping");
  return STEPS.map((s, i) => {
    let state: StepState;
    if (stop && i === stopIdx) state = "decided";
    else if (!stop || i < stopIdx || continues) state = "passed";
    else state = "not-reached";
    const t: StepTrace = { id: s.id, title: s.title, rule: s.rule(cfg), state };
    if (state === "decided") t.outcome = `${v.status === "reject" ? "Afgewezen" : v.status === "review" ? "Handmatig controleren" : v.status === "skip" ? "Geen oordeel van de regels" : "Voldoet"}: ${v.reasons[0] ?? v.notes[0] ?? ""}`;
    if (s.id === "verdict" && state === "passed") t.outcome = v.status === "high" ? "💰 Hoge marge" : v.status === "match" ? "Voldoet" : v.status === "review" ? "Handmatig controleren" : "";
    return t;
  });
}
