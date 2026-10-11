import { isGroup, type Condition, type Group, type Node } from "./engines/filters";

/** Eenvoudige filtervelden die naar AND-condities worden vertaald (en terug). */
export interface QuickFilters {
  models: string[];
  storage: number[];
  maxPrice: string;
  minProfit: string;
  minRoi: string;
  maxDistance: string;
  minBattery: string;
  maxAgeHours: string;
  includeWords: string[];
  excludeWords: string[];
  excludeDefects: boolean;
  excludeLocked: boolean;
  requirePhotos: boolean;
  requireInfo: boolean;
  newOnly: boolean;
  shipping: "" | "shipping" | "pickup";
  minScore: string;
  maxRisk: "" | "LOW" | "MEDIUM" | "HIGH";
  /** Onbekende afstand / batterijconditie: doorlaten of uitsluiten */
  unknownDistance: "allow" | "exclude";
  unknownBattery: "allow" | "exclude";
  /** Minimale betrouwbaarheid verkoper (0-100). Onbekend telt nooit als voldoende. */
  minSellerTrust: string;
  requireProof: boolean;
  /** Verder dan de maximale afstand: alleen interessant met verzending, voldoende betrouwbare verkoper en minimale winst (na verzendkosten) */
  farRule: { enabled: boolean; minProfit: string; minTrust: string };
}

export const emptyQuick = (): QuickFilters => ({
  models: [], storage: [], maxPrice: "", minProfit: "", minRoi: "", maxDistance: "", minBattery: "", maxAgeHours: "", includeWords: [], excludeWords: [],
  excludeDefects: false, excludeLocked: false, requirePhotos: false, requireInfo: false, newOnly: false, shipping: "", minScore: "", maxRisk: "",
  unknownDistance: "allow", unknownBattery: "allow", minSellerTrust: "", requireProof: false, farRule: { enabled: false, minProfit: "", minTrust: "" },
});

const RISK_EXCLUDE: Record<string, string[]> = { LOW: ["MEDIUM", "HIGH", "BLOCKED"], MEDIUM: ["HIGH", "BLOCKED"], HIGH: ["BLOCKED"] };
const num = (s: string) => Number(s.replace(",", "."));

export function quickToConditions(q: QuickFilters): Node[] {
  const c: Node[] = [];
  if (q.models.length) c.push({ field: "modelKey", operator: "in", value: q.models });
  if (q.storage.length) c.push({ field: "storageGb", operator: "in", value: q.storage });
  if (q.maxPrice !== "") c.push({ field: "askingEuro", operator: "lte", value: num(q.maxPrice) });
  if (q.minProfit !== "") c.push({ field: "expectedProfitEuro", operator: "gte", value: num(q.minProfit) });
  if (q.minRoi !== "") c.push({ field: "roiPct", operator: "gte", value: num(q.minRoi) });
  if (q.maxDistance !== "") {
    const near: Condition = { field: "distanceKm", operator: q.unknownDistance === "exclude" ? "lte" : "lte_if_known", value: num(q.maxDistance) };
    if (q.farRule.enabled) {
      // OF-regel: dichtbij, OF verder weg mét verzending, voldoende betrouwbare verkoper en minimale winst
      const far: Condition[] = [{ field: "distanceKm", operator: "gt", value: num(q.maxDistance) }, { field: "shippingAvailable", operator: "isTrue" }];
      if (q.farRule.minTrust !== "") far.push({ field: "sellerTrust", operator: "gte", value: num(q.farRule.minTrust) });
      if (q.farRule.minProfit !== "") far.push({ field: "expectedProfitEuro", operator: "gte", value: num(q.farRule.minProfit) });
      c.push({ op: "OR", children: [{ op: "AND", children: [near] }, { op: "AND", children: far }] });
    } else c.push(near);
  }
  if (q.minBattery !== "") c.push({ field: "batteryHealth", operator: q.unknownBattery === "exclude" ? "gte" : "gte_if_known", value: num(q.minBattery) });
  if (q.minSellerTrust !== "") c.push({ field: "sellerTrust", operator: "gte", value: num(q.minSellerTrust) });
  if (q.requireProof) c.push({ field: "purchaseProof", operator: "eq", value: "yes" });
  if (q.maxAgeHours !== "") c.push({ field: "ageHours", operator: "lte", value: num(q.maxAgeHours) });
  if (q.includeWords.length) c.push({ field: "text", operator: "containsAny", value: q.includeWords });
  if (q.excludeWords.length) c.push({ field: "text", operator: "containsNone", value: q.excludeWords });
  if (q.excludeDefects) c.push({ field: "hasDefect", operator: "isFalse" });
  if (q.excludeLocked) c.push({ field: "activationLock", operator: "neq", value: "locked" }, { field: "mdm", operator: "isFalse" });
  if (q.requirePhotos) c.push({ field: "photoCount", operator: "gte", value: 1 });
  if (q.requireInfo) c.push({ field: "descriptionLength", operator: "gte", value: 80 });
  if (q.shipping) c.push({ field: "shipping", operator: "containsAny", value: [q.shipping] });
  if (q.minScore !== "") c.push({ field: "score", operator: "gte", value: num(q.minScore) });
  if (q.maxRisk) c.push({ field: "riskLevel", operator: "nin", value: RISK_EXCLUDE[q.maxRisk] });
  return c;
}

export interface AdvancedGroup {
  op: "AND" | "OR";
  conditions: Array<{ field: string; operator: string; value: string }>;
}

const valueToString = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/** Verdeelt een bestaande regelboom in snelle filters + overige (geavanceerde) groepen. */
export function treeToQuick(tree: Group): { quick: QuickFilters; groups: AdvancedGroup[]; rootOp: "AND" | "OR" } {
  const quick = emptyQuick();
  const groups: AdvancedGroup[] = [];
  if (tree.op === "OR" && tree.children.length) {
    // Een OR-wortel is niet als snelle filters uit te drukken: alles als geavanceerde groep tonen
    groups.push(toGroup(tree));
    return { quick, groups, rootOp: "AND" };
  }
  const loose: Condition[] = [];
  for (const n of tree.children) {
    if (isGroup(n)) {
      const far = parseFarRule(n);
      if (far) {
        quick.maxDistance = far.maxDistance;
        quick.unknownDistance = far.unknownDistance;
        quick.farRule = far.rule;
        continue;
      }
      groups.push(toGroup(n));
      continue;
    }
    const v = n.value as never;
    if (n.field === "modelKey" && n.operator === "in") quick.models = (v as string[]) ?? [];
    else if (n.field === "storageGb" && n.operator === "in") quick.storage = ((v as unknown[]) ?? []).map(Number);
    else if (n.field === "askingEuro" && n.operator === "lte") quick.maxPrice = String(v);
    else if (n.field === "expectedProfitEuro" && n.operator === "gte") quick.minProfit = String(v);
    else if (n.field === "roiPct" && n.operator === "gte") quick.minRoi = String(v);
    else if (n.field === "distanceKm" && (n.operator === "lte_if_known" || n.operator === "lte")) { quick.maxDistance = String(v); quick.unknownDistance = n.operator === "lte" ? "exclude" : "allow"; }
    else if (n.field === "batteryHealth" && (n.operator === "gte_if_known" || n.operator === "gte")) { quick.minBattery = String(v); quick.unknownBattery = n.operator === "gte" ? "exclude" : "allow"; }
    else if (n.field === "sellerTrust" && n.operator === "gte") quick.minSellerTrust = String(v);
    else if (n.field === "purchaseProof" && n.operator === "eq" && v === "yes") quick.requireProof = true;
    else if (n.field === "ageHours" && n.operator === "lte") quick.maxAgeHours = String(v);
    else if (n.field === "text" && n.operator === "containsAny") quick.includeWords = (v as string[]) ?? [];
    else if (n.field === "text" && n.operator === "containsNone") quick.excludeWords = (v as string[]) ?? [];
    else if (n.field === "hasDefect" && n.operator === "isFalse") quick.excludeDefects = true;
    else if (n.field === "activationLock" && n.operator === "neq" && v === "locked") quick.excludeLocked = true;
    else if (n.field === "mdm" && n.operator === "isFalse") quick.excludeLocked = true;
    else if (n.field === "photoCount" && n.operator === "gte") quick.requirePhotos = true;
    else if (n.field === "descriptionLength" && n.operator === "gte") quick.requireInfo = true;
    else if (n.field === "shipping" && n.operator === "containsAny") quick.shipping = ((v as string[])?.[0] as "shipping" | "pickup") ?? "";
    else if (n.field === "score" && n.operator === "gte") quick.minScore = String(v);
    else if (n.field === "riskLevel" && n.operator === "nin") {
      const arr = (v as string[]) ?? [];
      quick.maxRisk = arr.includes("MEDIUM") ? "LOW" : arr.includes("HIGH") && arr.length === 2 ? "MEDIUM" : "HIGH";
    } else loose.push(n);
  }
  if (loose.length) groups.push({ op: "AND", conditions: loose.map((l) => ({ field: l.field, operator: l.operator, value: valueToString(l.value) })) });
  return { quick, groups, rootOp: "AND" };
}

/** Herkent de door quickToConditions gemaakte "dichtbij OF ver mét verzending"-groep. */
function parseFarRule(g: Group): { maxDistance: string; unknownDistance: "allow" | "exclude"; rule: QuickFilters["farRule"] } | null {
  if (g.op !== "OR" || g.children.length !== 2) return null;
  const [a, b] = g.children;
  if (!isGroup(a) || !isGroup(b) || a.children.length !== 1 || isGroup(a.children[0])) return null;
  const near = a.children[0] as Condition;
  if (near.field !== "distanceKm" || (near.operator !== "lte" && near.operator !== "lte_if_known")) return null;
  const far = b.children;
  if (far.some((x) => isGroup(x))) return null;
  const fc = far as Condition[];
  const gt = fc.find((x) => x.field === "distanceKm" && x.operator === "gt");
  if (!gt || gt.value !== near.value || !fc.some((x) => x.field === "shippingAvailable" && x.operator === "isTrue")) return null;
  const trust = fc.find((x) => x.field === "sellerTrust" && x.operator === "gte");
  const profit = fc.find((x) => x.field === "expectedProfitEuro" && x.operator === "gte");
  if (fc.length !== 2 + (trust ? 1 : 0) + (profit ? 1 : 0)) return null;
  return { maxDistance: String(near.value), unknownDistance: near.operator === "lte" ? "exclude" : "allow", rule: { enabled: true, minProfit: profit ? String(profit.value) : "", minTrust: trust ? String(trust.value) : "" } };
}

function toGroup(g: Group): AdvancedGroup {
  const flat: Node[] = g.children;
  return {
    op: g.op,
    conditions: flat.filter((n): n is Condition => !isGroup(n)).map((n) => ({ field: n.field, operator: n.operator, value: valueToString(n.value) })),
  };
}

export function parseValue(field: string, operator: string, raw: string, type: string): unknown {
  if (operator === "isTrue" || operator === "isFalse" || operator === "isKnown") return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (operator === "between") return parts.slice(0, 2).map(Number);
  if (["in", "nin", "containsAny", "containsAll", "containsNone"].includes(operator)) return type === "number" ? parts.map(Number) : parts;
  return type === "number" ? Number(raw.replace(",", ".")) : raw.trim();
}

export function buildTree(q: QuickFilters, groups: AdvancedGroup[], defs: Array<{ key: string; type: string }>): Group {
  const children: Node[] = quickToConditions(q);
  for (const g of groups) {
    const conds: Condition[] = g.conditions
      .filter((c) => c.field && c.operator)
      .map((c) => ({ field: c.field, operator: c.operator as Condition["operator"], value: parseValue(c.field, c.operator, c.value, defs.find((d) => d.key === c.field)?.type ?? "string") }));
    if (conds.length) children.push({ op: g.op, children: conds });
  }
  return { op: "AND", children };
}

/** Korte, leesbare samenvatting van een filter (voor lijsten). */
export function summarizeFilter(q: QuickFilters, groups: AdvancedGroup[]): string[] {
  const out: string[] = [];
  if (q.models.length) out.push(q.models.length === 1 ? q.models[0] : `${q.models.length} modellen`);
  if (q.storage.length) out.push(q.storage.map((s) => (s >= 1024 ? `${s / 1024} TB` : `${s} GB`)).join("/"));
  if (q.maxPrice) out.push(`≤ €${q.maxPrice}`);
  if (q.minProfit) out.push(`winst ≥ €${q.minProfit}`);
  if (q.minRoi) out.push(`rendement ≥ ${q.minRoi}%`);
  if (q.maxDistance) out.push(`≤ ${q.maxDistance} km${q.unknownDistance === "exclude" ? " (afstand verplicht)" : ""}${q.farRule.enabled ? ` of ver mét verzending${q.farRule.minProfit ? ` en winst ≥ €${q.farRule.minProfit}` : ""}` : ""}`);
  if (q.minSellerTrust) out.push(`verkoper ≥ ${q.minSellerTrust}`);
  if (q.requireProof) out.push("aankoopbewijs");
  if (q.minBattery) out.push(`batterij ≥ ${q.minBattery}%`);
  if (q.maxAgeHours) out.push(`≤ ${q.maxAgeHours} uur oud`);
  if (q.minScore) out.push(`score ≥ ${q.minScore}`);
  if (q.maxRisk) out.push(`risico ≤ ${q.maxRisk === "LOW" ? "laag" : q.maxRisk === "MEDIUM" ? "gemiddeld" : "hoog"}`);
  if (q.includeWords.length) out.push(`bevat: ${q.includeWords.join("/")}`);
  if (q.excludeWords.length) out.push(`zonder: ${q.excludeWords.join("/")}`);
  if (q.excludeDefects) out.push("geen defecten");
  if (q.excludeLocked) out.push("geen iCloud/MDM-slot");
  if (q.requirePhotos) out.push("met foto's");
  if (q.requireInfo) out.push("voldoende info");
  if (q.shipping) out.push(q.shipping === "shipping" ? "verzenden" : "ophalen");
  if (groups.length) out.push(`${groups.length} extra groep${groups.length > 1 ? "en" : ""}`);
  return out;
}
