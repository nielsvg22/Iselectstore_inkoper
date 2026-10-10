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
}

export const emptyQuick = (): QuickFilters => ({
  models: [], storage: [], maxPrice: "", minProfit: "", minRoi: "", maxDistance: "", minBattery: "", maxAgeHours: "", includeWords: [], excludeWords: [],
  excludeDefects: false, excludeLocked: false, requirePhotos: false, requireInfo: false, newOnly: false, shipping: "", minScore: "", maxRisk: "",
});

const RISK_EXCLUDE: Record<string, string[]> = { LOW: ["MEDIUM", "HIGH", "BLOCKED"], MEDIUM: ["HIGH", "BLOCKED"], HIGH: ["BLOCKED"] };
const num = (s: string) => Number(s.replace(",", "."));

export function quickToConditions(q: QuickFilters): Condition[] {
  const c: Condition[] = [];
  if (q.models.length) c.push({ field: "modelKey", operator: "in", value: q.models });
  if (q.storage.length) c.push({ field: "storageGb", operator: "in", value: q.storage });
  if (q.maxPrice !== "") c.push({ field: "askingEuro", operator: "lte", value: num(q.maxPrice) });
  if (q.minProfit !== "") c.push({ field: "expectedProfitEuro", operator: "gte", value: num(q.minProfit) });
  if (q.minRoi !== "") c.push({ field: "roiPct", operator: "gte", value: num(q.minRoi) });
  if (q.maxDistance !== "") c.push({ field: "distanceKm", operator: "lte_if_known", value: num(q.maxDistance) });
  if (q.minBattery !== "") c.push({ field: "batteryHealth", operator: "gte_if_known", value: num(q.minBattery) });
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
      groups.push(toGroup(n));
      continue;
    }
    const v = n.value as never;
    if (n.field === "modelKey" && n.operator === "in") quick.models = (v as string[]) ?? [];
    else if (n.field === "storageGb" && n.operator === "in") quick.storage = ((v as unknown[]) ?? []).map(Number);
    else if (n.field === "askingEuro" && n.operator === "lte") quick.maxPrice = String(v);
    else if (n.field === "expectedProfitEuro" && n.operator === "gte") quick.minProfit = String(v);
    else if (n.field === "roiPct" && n.operator === "gte") quick.minRoi = String(v);
    else if (n.field === "distanceKm" && n.operator === "lte_if_known") quick.maxDistance = String(v);
    else if (n.field === "batteryHealth" && n.operator === "gte_if_known") quick.minBattery = String(v);
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
