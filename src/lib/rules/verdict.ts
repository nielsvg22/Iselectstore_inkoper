import { assumedBatteryPct, batteryAdjustEuro, batteryDeductionEuro, modelAgeMonths } from "./battery";
import { assessBid } from "./bid";
import { findBasePrice, type BasePrice, type RulesConfig } from "./config";
import { centerHits } from "./geo";
import { allowedPrices } from "./margin";
import { isNewestPro, minPriceEuro } from "./release";
import { analyzeScratch, type ScratchState } from "./scratch";
import { shippingEligibility, type SellerFacts, type ShipResult } from "./shipping";

export interface VerdictInput {
  modelKey: string;
  modelLabel: string;
  family: string;
  storageGb: number | null;
  ramGb: number | null;
  chip: string | null;
  screenInch: number | null;
  connectivity: string | null;
  batteryPct: number | null;
  text: string;
  mpCondition: string | null;
  /** Marktplaats-prijstype (FIXED, MIN_BID, BIDDING, …) */
  priceType: string | null;
  askEuro: number | null;
  bidEuro: number | null;
  latitude: number | null;
  longitude: number | null;
  /** hemelsbreed vanaf Apeldoorn als die al is berekend */
  distanceKm: number | null;
  /** biedt de verkoper verzending aan? */
  shippingOffered: boolean;
  seller: SellerFacts;
  directBuy: boolean;
  now: Date;
  /** voorraad van dit model (alleen voor de voorraadregel) */
  stock?: { count: number; sold30d: number } | null;
}

export type VerdictStatus = "skip" | "reject" | "review" | "match" | "high";
export type PriceKind = "ask" | "bid" | "both" | "bid0" | "none";
export interface Line { label: string; euro: number }

export interface Verdict {
  status: VerdictStatus;
  reasons: string[];
  notes: string[];
  flags: string[];
  priceKind: PriceKind;
  effectiveEuro: number | null;
  askEuro: number | null;
  bidEuro: number | null;
  baseEuro: number | null;
  baseKind: "sell" | "buy" | null;
  maxSellEuro: number | null;
  lines: Line[];
  allowedAsk: number | null;
  allowedBid: number | null;
  highAsk: number | null;
  highBid: number | null;
  marginEuro: number | null;
  battery: { pct: number | null; assumed: boolean; known: boolean };
  scratch: { state: ScratchState; evidence: string | null };
  storageAssumed: boolean;
  distance: { km: number | null; nearestCenter: string | null; shipping: ShipResult | null; newestPro: boolean };
  mpCondition: string | null;
}

const MAC_FAMILIES = new Set(["macbook_air", "macbook_pro", "mac_mini", "imac", "mac_studio"]);

function emptyVerdict(i: VerdictInput): Verdict {
  return {
    status: "skip", reasons: [], notes: [], flags: [], priceKind: "none", effectiveEuro: null, askEuro: i.askEuro, bidEuro: i.bidEuro,
    baseEuro: null, baseKind: null, maxSellEuro: null, lines: [], allowedAsk: null, allowedBid: null, highAsk: null, highBid: null, marginEuro: null,
    battery: { pct: i.batteryPct, assumed: false, known: i.batteryPct != null }, scratch: { state: "unknown", evidence: null }, storageAssumed: false,
    distance: { km: i.distanceKm, nearestCenter: null, shipping: null, newestPro: false }, mpCondition: i.mpCondition,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Past alle inkoopregels toe op één advertentie. Pure functie: dezelfde invoer geeft altijd dezelfde uitkomst. */
export function evaluateRules(i: VerdictInput, prices: BasePrice[], cfg: RulesConfig): Verdict {
  const v = emptyVerdict(i);
  if (!cfg.enabled) { v.notes.push("Inkoopregels staan uit"); return v; }
  const reject = (r: string) => { v.status = "reject"; v.reasons.push(r); return v; };
  const batteryFamily = cfg.battery.families.includes(i.family);

  // ---- vaste uitsluitingen die niet van een basisprijs afhangen ----
  if (cfg.macbook.excludeIntel && MAC_FAMILIES.has(i.family) && (/intel/i.test(i.chip ?? "") || /intel/.test(i.modelKey))) return reject("Intel-Mac (alleen Apple-chip, vanaf M1)");
  if (i.family === "macbook_air") {
    const chip = (i.chip ?? "").toUpperCase().match(/M\d/)?.[0];
    if (chip && !cfg.macbook.airChips.includes(chip)) return reject(`MacBook Air met chip ${chip} valt buiten de ingestelde chips`);
    if (i.screenInch != null && !cfg.macbook.airScreens.includes(Math.round(i.screenInch))) return reject(`Schermgrootte ${i.screenInch}″ valt buiten de ingestelde maten`);
    if (i.ramGb != null && !cfg.macbook.ramGb.includes(i.ramGb)) return reject(`RAM ${i.ramGb} GB valt buiten de ingestelde waarden`);
    if (i.storageGb != null && !cfg.macbook.ssdGb.includes(i.storageGb)) return reject(`SSD ${i.storageGb} GB valt buiten de ingestelde waarden`);
  }
  if (i.batteryPct != null && batteryFamily && i.batteryPct < cfg.battery.excludeBelowPct) return reject(`Batterij ${i.batteryPct}% is lager dan ${cfg.battery.excludeBelowPct}% (wordt nooit gekocht)`);

  // ---- afstand en verzenden ----
  const hits = centerHits(i.latitude, i.longitude, cfg.distance);
  const km = i.distanceKm ?? hits.find((h) => h.name === "Apeldoorn")?.km ?? null;
  v.distance.km = km;
  const nearest = hits.length ? hits.reduce((a, b) => (a.km <= b.km ? a : b)) : null;
  v.distance.nearestCenter = nearest ? `${nearest.name} (${nearest.km} km)` : null;
  const newestPro = isNewestPro(i.modelKey, i.now, cfg.distance);
  v.distance.newestPro = newestPro;
  if (hits.some((h) => h.flag)) v.flags.push("near");
  if (hits.some((h) => h.hot)) v.flags.push("hot");
  const maxKm = newestPro ? cfg.distance.newestProMaxKm : cfg.distance.maxKmDefault;
  let shipping: ShipResult | null = null;
  let reviewReason: string | null = null;
  if (km == null) {
    v.notes.push("Afstand onbekend");
    if (!cfg.distance.includeShipping) { reviewReason = `Afstand onbekend: ophalen binnen ${cfg.distance.pickupMaxKm} km is niet vast te stellen`; v.flags.push("distanceUnknown"); }
  }
  else if (!cfg.distance.includeShipping && km > cfg.distance.pickupMaxKm) return reject(`${km} km is buiten ${cfg.distance.pickupMaxKm} km hemelsbreed (verzending staat uit)`);
  else if (km > maxKm) return reject(`${km} km is verder dan het maximum van ${maxKm} km${newestPro ? " voor de nieuwste Pro/Pro Max" : ""}`);
  else if (km > cfg.distance.pickupMaxKm) {
    if (!i.shippingOffered) return reject(`${km} km is verder dan ${cfg.distance.pickupMaxKm} km en de verkoper biedt geen verzending aan`);
    if (cfg.shipping.enabled) {
      shipping = shippingEligibility(i.seller, cfg.shipping);
      v.distance.shipping = shipping;
      if (shipping.status === "never" || shipping.status === "fail") return reject(`Verzendfilter: ${shipping.reasons.join("; ")}`);
      if (shipping.status === "unknown") { reviewReason ??= "Verkoper handmatig controleren"; v.flags.push("sellerCheck"); v.notes.push(`Verkoper handmatig controleren: ${shipping.reasons.join("; ")}`); }
    }
  } else if (cfg.distance.perKmEnabled) {
    shipping = shippingEligibility(i.seller, cfg.shipping);
    v.distance.shipping = shipping;
  }

  // ---- krassen, batterij ----
  const sc = analyzeScratch(i.text, i.mpCondition, cfg.scratch);
  v.scratch = sc;
  if (sc.state === "free") v.flags.push("scratchFree");
  if (sc.state === "scratched") v.flags.push("scratched");
  let batteryPct = i.batteryPct;
  if (batteryFamily && batteryPct == null && cfg.battery.assumeFromAge) {
    const age = modelAgeMonths(i.modelKey, i.now);
    if (age != null) { batteryPct = assumedBatteryPct(age, cfg.battery); v.battery = { pct: batteryPct, assumed: true, known: false }; v.notes.push(`Batterij onbekend: aangenomen ${batteryPct}% (model is ${age} maanden oud)`); }
  }
  if (batteryFamily && batteryPct == null) v.flags.push("batteryUnknown");
  else if (v.battery.assumed) v.flags.push("batteryAssumed");

  // ---- prijzen: vraagprijs / bieden vanaf ----
  const ask = i.askEuro != null && i.askEuro > 0 ? i.askEuro : null;
  const bidKnown = i.bidEuro != null && i.bidEuro > 0 ? i.bidEuro : null;
  const bidZero = (i.priceType === "MIN_BID" || i.priceType === "BIDDING") && ask == null && bidKnown == null;
  v.priceKind = ask != null && bidKnown != null ? "both" : ask != null ? "ask" : bidKnown != null ? "bid" : bidZero ? "bid0" : "none";
  if (i.directBuy) v.flags.push("directBuy");

  // ---- basisprijs ----
  const variant = i.family === "ipad" && i.modelKey === "ipad-air-m2" && i.screenInch != null ? String(Math.round(i.screenInch)) : "";
  const found = findBasePrice(prices, i.modelKey, i.storageGb, variant);
  if (!found.price) {
    v.notes.push(`Geen basisprijs voor ${i.modelLabel}${i.storageGb ? ` ${i.storageGb} GB` : ""}`);
    if (cfg.unknownBase === "skip") return reject("Geen basisprijs ingesteld voor dit model/opslag");
    v.status = "skip";
    return v;
  }
  v.baseEuro = found.price.priceEuro;
  v.baseKind = found.price.kind;
  v.storageAssumed = found.storageAssumed;
  if (found.storageAssumed) { v.flags.push("storageUnknown"); v.notes.push("Opslag onbekend: gemiddelde van de bekende opslagen gebruikt (?)"); }

  const lines: Line[] = [{ label: `Basisprijs ${i.modelLabel}${found.storageAssumed ? " (opslag onbekend, gemiddelde)" : i.storageGb ? ` ${i.storageGb} GB` : ""}`, euro: found.price.priceEuro }];
  let sell = found.price.priceEuro;
  const add = (label: string, euro: number) => { if (euro !== 0) { lines.push({ label, euro: round(euro) }); sell += euro; } };

  if (found.price.kind === "sell") {
    if (batteryFamily && batteryPct != null) {
      if (cfg.priceBase === "sell") add(`Batterij ${batteryPct}%${v.battery.assumed ? " (aangenomen)" : ""}`, -batteryDeductionEuro(batteryPct));
      else add(`Batterij ${batteryPct}%${v.battery.assumed ? " (aangenomen)" : ""}`, batteryAdjustEuro(batteryPct));
    }
    if (cfg.priceBase === "sell") add(sc.state === "scratched" ? "Met krassen" : sc.state === "unknown" ? "Krassen onbekend" : "Krasvrij", sc.state === "scratched" ? -cfg.scratch.scratchedEuro : sc.state === "unknown" ? -cfg.scratch.unknownEuro : 0);
    else if (sc.state === "free") add("Krasvrij", cfg.scratch.freeBonusEuro);
    if (MAC_FAMILIES.has(i.family) && i.ramGb != null) {
      const std = cfg.macbook.standardRamGb[i.modelKey] ?? cfg.macbook.standardRamGb.default ?? 8;
      if (i.ramGb > std) add(`RAM ${i.ramGb} GB (standaard ${std} GB)`, cfg.macbook.ramBonusEuro[String(i.ramGb)] ?? 0);
    }
  }
  if (i.family === "ipad" && /cellular|4g|5g|sim/i.test(i.connectivity ?? "")) add("Cellular (4G/5G)", cfg.ipad.cellularBonusEuro);
  const bonus = Math.max(0, ...hits.map((h) => h.bonusEuro));
  if (bonus > 0) add(`Dichtbij (${v.distance.nearestCenter ?? ""})`, bonus);
  const shipOk = shipping?.status === "ok";
  if (cfg.distance.perKmEnabled && km != null && cfg.distance.perKmEuro > 0 && !shipOk) add(`Rijfilter ${km} km × €${cfg.distance.perKmEuro}`, -round(km * cfg.distance.perKmEuro));
  v.lines = lines;
  v.maxSellEuro = round(sell);

  // ---- toegestane prijzen ----
  if (found.price.kind === "buy" || cfg.priceBase === "buy85") {
    v.allowedAsk = v.allowedBid = round(sell);
    const row = allowedPrices(sell, cfg);
    v.highAsk = found.price.kind === "buy" ? null : round(sell - row.askHigh);
    v.highBid = found.price.kind === "buy" ? null : round(sell - row.askHigh);
  } else {
    const a = allowedPrices(sell, cfg);
    v.allowedAsk = round(a.allowedAsk);
    v.allowedBid = round(a.allowedBid);
    v.highAsk = round(a.highAsk);
    v.highBid = round(a.highBid);
  }

  // ---- beoordeel de prijs ----
  const minP = minPriceEuro(i.modelKey, i.family, cfg.minPrice);
  let eff: number | null = null;
  let pass = false;
  let high = false;
  let kindForHigh: "ask" | "bid" = "ask";
  if (v.priceKind === "ask") { eff = ask!; pass = eff <= v.allowedAsk!; high = v.highAsk != null && eff <= v.highAsk; }
  else if (v.priceKind === "bid") { eff = bidKnown!; kindForHigh = "bid"; pass = eff <= v.allowedBid!; high = v.highBid != null && eff <= v.highBid; }
  else if (v.priceKind === "both") {
    const b = assessBid(ask!, bidKnown!, cfg.bid);
    v.notes.push(b.note);
    const askPass = ask! <= v.allowedAsk!;
    const bidPass = b.effectiveEuro <= v.allowedBid!;
    const bidHigh = v.highBid != null && b.effectiveEuro <= v.highBid;
    const askHigh = v.highAsk != null && ask! <= v.highAsk;
    pass = askPass || bidPass;
    high = askHigh || bidHigh;
    eff = askPass || !bidPass ? ask! : b.effectiveEuro;
    kindForHigh = askHigh || !bidHigh ? "ask" : "bid";
    if (!askPass && bidPass) v.notes.push(`Vraagprijs €${ask} is te hoog, maar bieden vanaf (€${b.effectiveEuro}) valt binnen de toegestane prijs`);
  } else if (v.priceKind === "bid0") {
    kindForHigh = "bid";
    const zb = cfg.bid.zeroBid;
    const trusted = shipping?.status === "ok";
    const near = km != null && km <= zb.requireTrustedOrNearKm;
    const fails: string[] = [];
    if (batteryPct == null || v.battery.assumed || batteryPct < zb.minBatteryPct) fails.push(`batterij niet aantoonbaar ${zb.minBatteryPct}%+`);
    if (zb.requireScratchFree && sc.state !== "free") fails.push("niet krasvrij/altijd beschermd");
    if (!trusted && !near) fails.push(`geen betrouwbare verkoper en niet binnen ${zb.requireTrustedOrNearKm} km`);
    v.flags.push("bid0");
    if (fails.length === 0) { v.notes.push("Bieden vanaf €0: voldoet aan de aanvullende voorwaarden (batterij, krasvrij, betrouwbaar of dichtbij)"); v.effectiveEuro = null; return finish(v, i, cfg, null, true, false, "bid", reviewReason); }
    if (cfg.bid.zeroBidMode === "filter") return reject(`Bieden vanaf €0 zonder prijs en niet interessant: ${fails.join("; ")}`);
    v.status = "review"; v.reasons.push(`Bieden vanaf €0: ${fails.join("; ")}`); return v;
  } else {
    v.status = "review"; v.reasons.push("Prijs onbekend"); return v;
  }
  v.effectiveEuro = eff;
  if (eff != null && eff > 0 && eff < minP) return reject(`€${eff} is lager dan de minimumprijs €${minP} (waarschijnlijk hoesje of accessoire)`);
  return finish(v, i, cfg, eff, pass, high, kindForHigh, reviewReason);
}

function finish(v: Verdict, i: VerdictInput, cfg: RulesConfig, eff: number | null, pass: boolean, high: boolean, kind: "ask" | "bid", reviewReason: string | null = null): Verdict {
  const known = new Set(cfg.highMargin.requireKnown);
  const allKnown =
    (!known.has("model") || i.family !== "unknown") &&
    (!known.has("storage") || (i.storageGb != null && !v.storageAssumed)) &&
    (!known.has("distance") || v.distance.km != null) &&
    (!known.has("price") || eff != null);
  v.marginEuro = eff != null && v.maxSellEuro != null ? round(v.maxSellEuro - eff) : null;
  if (!pass) { v.status = "reject"; v.reasons.push(eff != null ? `€${eff} is hoger dan de toegestane ${kind === "bid" ? "bieden-vanaf-prijs" : "vraagprijs"} (€${kind === "bid" ? v.allowedBid : v.allowedAsk})` : "Prijs te hoog"); return v; }
  const minMargin = kind === "bid" ? cfg.highMargin.minBidMarginEuro : cfg.highMargin.minAskMarginEuro;
  const isHigh = cfg.highMargin.enabled && high && allKnown && v.baseKind === "sell" && (v.marginEuro == null || v.marginEuro >= minMargin);
  // voorraadregel: bij volle voorraad alleen echte topdeals
  if (cfg.stock.enabled && i.stock) {
    const threshold = Math.max(1, Math.round(cfg.stock.baseThreshold + i.stock.sold30d * cfg.stock.perSoldLast30d));
    if (i.stock.count >= threshold && !isHigh) { v.status = "reject"; v.reasons.push(`Voorraad ${i.stock.count} ≥ ${threshold}: alleen deals met hoge marge`); return v; }
    if (i.stock.count >= threshold) v.notes.push(`Voorraad ${i.stock.count} ≥ ${threshold}: alleen hoge marge toegelaten`);
  }
  if (isHigh) v.flags.push("high");
  v.status = reviewReason ? "review" : isHigh ? "high" : "match";
  if (reviewReason) v.reasons.push(reviewReason);
  return v;
}

export const FLAG_EMOJI: Record<string, string> = { near: "📍", hot: "🔴", scratchFree: "✨", scratched: "⚠️", high: "💰", directBuy: "🛒", storageUnknown: "?", batteryUnknown: "?", batteryAssumed: "?", bid0: "0️⃣", sellerCheck: "👀" };
