import { z } from "zod";

export interface FilterContext {
  modelKey: string;
  family: string;
  modelLabel: string;
  storageGb: number | null;
  ramGb: number | null;
  batteryHealth: number | null;
  askingCents: number | null;
  valuationCertain?: boolean;
  expectedValueCents?: number | null;
  expectedProfitCents: number | null;
  roiPct: number | null;
  maxBidCents: number | null;
  distanceKm: number | null;
  driveSeconds?: number | null;
  ageHours: number | null;
  text: string;
  photoCount: number;
  descriptionLength: number;
  shipping: string[]; // "shipping" | "pickup"
  condition: string | null;
  hasDefect: boolean;
  activationLock: "locked" | "clear" | null;
  mdm: boolean;
  score: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  blocked: boolean;
  location: string | null;
  /** 0–100; null = onvoldoende gegevens (nooit automatisch "betrouwbaar") */
  sellerTrust: number | null;
  sellerTrustLevel: string | null;
  sellerVerified: boolean | null;
  /** Alleen expliciet aangeleverde verkopergegevens; null blijft onbekend. */
  sellerRating?: number | null;
  sellerReviewCount?: number | null;
  sellerAgeMonths?: number | null;
  shippingAvailable: boolean;
  pickupAvailable: boolean;
  batteryKnown: boolean;
  /** "yes" = aankoopbewijs genoemd, "no" = expliciet niet, null = niet vermeld */
  purchaseProof: string | null;
}

export type Operator =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "gte"
  | "lte"
  | "between"
  | "gte_if_known"
  | "lte_if_known"
  | "gt"
  | "lt"
  | "containsAny"
  | "containsAll"
  | "containsNone"
  | "isTrue"
  | "isFalse"
  | "isKnown";

export interface Condition {
  field: string;
  operator: Operator;
  value?: unknown;
}
export interface Group {
  op: "AND" | "OR";
  children: Array<Group | Condition>;
}
export type Node = Group | Condition;

export const isGroup = (n: Node): n is Group => "children" in n;

export type FieldType = "number" | "string" | "boolean" | "text" | "list";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  operators: Operator[];
  help?: string;
}

const NUM_OPS: Operator[] = [
  "gte",
  "lte",
  "gt",
  "lt",
  "between",
  "eq",
  "gte_if_known",
  "lte_if_known",
  "isKnown",
];
export const FIELD_DEFS: FieldDef[] = [
  {
    key: "valuationCertain",
    label: "Marktwaarde voldoende onderbouwd",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "expectedValueEuro",
    label: "Geschatte marktwaarde",
    type: "number",
    unit: "€",
    operators: NUM_OPS,
  },
  {
    key: "blocked",
    label: "Uitgesloten door risicocontrole",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "modelKey",
    label: "Productmodel",
    type: "string",
    operators: ["in", "nin", "eq", "neq"],
    help: "bijv. iphone-15-pro",
  },
  {
    key: "family",
    label: "Productfamilie",
    type: "string",
    operators: ["in", "nin", "eq", "neq"],
  },
  {
    key: "storageGb",
    label: "Opslag",
    type: "number",
    unit: "GB",
    operators: ["in", "nin", ...NUM_OPS],
  },
  {
    key: "ramGb",
    label: "RAM",
    type: "number",
    unit: "GB",
    operators: ["in", "nin", ...NUM_OPS],
  },
  {
    key: "batteryHealth",
    label: "Batterijconditie",
    type: "number",
    unit: "%",
    operators: NUM_OPS,
  },
  {
    key: "askingEuro",
    label: "Vraagprijs",
    type: "number",
    unit: "€",
    operators: ["gte", "lte", "between"],
  },
  {
    key: "expectedProfitEuro",
    label: "Verwachte winst",
    type: "number",
    unit: "€",
    operators: ["gte", "lte", "between"],
  },
  {
    key: "roiPct",
    label: "Rendement op inkoop",
    type: "number",
    unit: "%",
    operators: ["gte", "lte", "between"],
  },
  {
    key: "distanceKm",
    label: "Afstand",
    type: "number",
    unit: "km",
    operators: ["lte", "gte", "between", "lte_if_known"],
  },
  {
    key: "ageHours",
    label: "Advertentieleeftijd",
    type: "number",
    unit: "uur",
    operators: ["lte", "gte", "between"],
  },
  {
    key: "text",
    label: "Tekst (titel + omschrijving)",
    type: "text",
    operators: ["containsAny", "containsAll", "containsNone"],
  },
  {
    key: "photoCount",
    label: "Aantal foto's",
    type: "number",
    operators: ["gte", "lte"],
  },
  {
    key: "descriptionLength",
    label: "Lengte omschrijving",
    type: "number",
    unit: "tekens",
    operators: ["gte", "lte"],
  },
  {
    key: "shipping",
    label: "Verzending / ophalen",
    type: "list",
    operators: ["containsAny", "containsNone"],
    help: "shipping, pickup",
  },
  {
    key: "condition",
    label: "Conditie (A/B/C)",
    type: "string",
    operators: ["in", "nin", "eq", "isKnown"],
  },
  {
    key: "hasDefect",
    label: "Defect/schade vermeld",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "activationLock",
    label: "iCloud / Activatieslot",
    type: "string",
    operators: ["eq", "neq", "in", "nin", "isKnown"],
    help: "locked, clear",
  },
  {
    key: "mdm",
    label: "MDM vermeld",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "score",
    label: "Dealscore",
    type: "number",
    operators: ["gte", "lte", "between"],
  },
  {
    key: "riskScore",
    label: "Risicoscore (0-100)",
    type: "number",
    operators: ["lte", "gte"],
  },
  {
    key: "riskLevel",
    label: "Risiconiveau",
    type: "string",
    operators: ["in", "nin", "eq", "neq"],
    help: "LOW, MEDIUM, HIGH, BLOCKED",
  },
  {
    key: "sellerTrust",
    label: "Betrouwbaarheid verkoper (0-100)",
    type: "number",
    operators: ["gte", "lte", "isKnown"],
    help: "Onbekend = onvoldoende gegevens; telt nooit als betrouwbaar",
  },
  {
    key: "sellerTrustLevel",
    label: "Betrouwbaarheidsniveau verkoper",
    type: "string",
    operators: ["in", "nin", "eq", "neq"],
    help: "HIGH, MEDIUM, LOW, UNKNOWN",
  },
  {
    key: "sellerVerified",
    label: "Verkoper geverifieerd (platform)",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "sellerRating",
    label: "Beoordeling verkoper",
    type: "number",
    operators: ["gte", "lte", "isKnown"],
    help: "Score uit de bron (0–5), onbekend is geen positieve beoordeling.",
  },
  {
    key: "sellerReviewCount",
    label: "Aantal reviews verkoper",
    type: "number",
    operators: ["gte", "lte", "isKnown"],
  },
  {
    key: "sellerAgeMonths",
    label: "Accountleeftijd verkoper",
    type: "number",
    unit: "maanden",
    operators: ["gte", "lte", "isKnown"],
  },
  {
    key: "shippingAvailable",
    label: "Verzending mogelijk",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "pickupAvailable",
    label: "Ophalen mogelijk",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "batteryKnown",
    label: "Batterijconditie bekend",
    type: "boolean",
    operators: ["isTrue", "isFalse"],
  },
  {
    key: "purchaseProof",
    label: "Aankoopbewijs",
    type: "string",
    operators: ["eq", "neq", "in", "isKnown"],
    help: "yes, no (leeg = niet vermeld)",
  },
  {
    key: "location",
    label: "Plaats",
    type: "string",
    operators: ["containsAny", "containsNone", "eq", "in"],
  },
];

function fieldValue(ctx: FilterContext, field: string): unknown {
  switch (field) {
    case "expectedValueEuro":
      return ctx.expectedValueCents == null
        ? null
        : ctx.expectedValueCents / 100;
    case "askingEuro":
      return ctx.askingCents == null ? null : ctx.askingCents / 100;
    case "expectedProfitEuro":
      return ctx.expectedProfitCents == null
        ? null
        : ctx.expectedProfitCents / 100;
    default:
      return (ctx as unknown as Record<string, unknown>)[field] ?? null;
  }
}

const asList = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
const lc = (v: unknown) => String(v).toLowerCase();

export function evalCondition(c: Condition, ctx: FilterContext): boolean {
  const raw = fieldValue(ctx, c.field);
  const val = c.value;
  switch (c.operator) {
    case "eq":
      return raw != null && lc(raw) === lc(val);
    case "neq":
      return raw == null || lc(raw) !== lc(val);
    case "in":
      return raw != null && asList(val).some((x) => lc(x) === lc(raw));
    case "nin":
      return raw == null || !asList(val).some((x) => lc(x) === lc(raw));
    case "gte":
      return typeof raw === "number" && raw >= Number(val);
    case "lte":
      return typeof raw === "number" && raw <= Number(val);
    case "gt":
      return typeof raw === "number" && raw > Number(val);
    case "lt":
      return typeof raw === "number" && raw < Number(val);
    case "gte_if_known":
      return raw == null || (typeof raw === "number" && raw >= Number(val));
    case "lte_if_known":
      return raw == null || (typeof raw === "number" && raw <= Number(val));
    case "between": {
      const [a, b] = asList(val).map(Number);
      return typeof raw === "number" && raw >= a && raw <= b;
    }
    case "containsAny": {
      const hay = Array.isArray(raw) ? raw.map(lc) : [lc(raw ?? "")];
      return asList(val).some((n) => hay.some((h) => h.includes(lc(n))));
    }
    case "containsAll": {
      const hay = Array.isArray(raw) ? raw.map(lc) : [lc(raw ?? "")];
      return asList(val).every((n) => hay.some((h) => h.includes(lc(n))));
    }
    case "containsNone": {
      const hay = Array.isArray(raw) ? raw.map(lc) : [lc(raw ?? "")];
      return !asList(val).some((n) => hay.some((h) => h.includes(lc(n))));
    }
    case "isTrue":
      return raw === true;
    case "isFalse":
      return raw === false || raw == null;
    case "isKnown":
      return raw != null && raw !== "";
    default:
      return false;
  }
}

/** Lege groep = alles matcht. */
export function evaluate(node: Node, ctx: FilterContext): boolean {
  if (!isGroup(node)) return evalCondition(node, ctx);
  if (!node.children.length) return true;
  return node.op === "AND"
    ? node.children.every((c) => evaluate(c, ctx))
    : node.children.some((c) => evaluate(c, ctx));
}

const OP_TEXT: Record<string, string> = {
  eq: "=",
  neq: "≠",
  in: "is één van",
  nin: "is geen van",
  gte: "≥",
  lte: "≤",
  gt: ">",
  lt: "<",
  between: "tussen",
  gte_if_known: "≥ (indien bekend)",
  lte_if_known: "≤ (indien bekend)",
  containsAny: "bevat één van",
  containsAll: "bevat alle",
  containsNone: "bevat geen van",
  isTrue: "is waar",
  isFalse: "is onwaar",
  isKnown: "is bekend",
};

export interface Explained {
  pass: boolean;
  kind: "group" | "condition";
  op?: "AND" | "OR";
  label: string;
  /** werkelijke waarde van de advertentie (alleen bij voorwaarden) */
  actual?: string;
  children?: Explained[];
}

function showValue(field: string, v: unknown): string {
  if (v == null || v === "") return "onbekend";
  const def = FIELD_DEFS.find((f) => f.key === field);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "geen";
  if (typeof v === "number")
    return `${Math.round(v * 100) / 100}${def?.unit ? ` ${def.unit}` : ""}`;
  if (typeof v === "boolean") return v ? "ja" : "nee";
  const t = String(v);
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

/** Zelfde uitkomst als evaluate(), maar met per voorwaarde de werkelijke waarde (voor "waarom wel/niet?"). */
export function explain(node: Node, ctx: FilterContext): Explained {
  if (!isGroup(node)) {
    const def = FIELD_DEFS.find((f) => f.key === node.field);
    const exp =
      node.operator === "isTrue" ||
      node.operator === "isFalse" ||
      node.operator === "isKnown"
        ? ""
        : ` ${Array.isArray(node.value) ? node.value.join("/") : String(node.value ?? "")}`;
    return {
      kind: "condition",
      pass: evalCondition(node, ctx),
      label: `${def?.label ?? node.field} ${OP_TEXT[node.operator] ?? node.operator}${exp}`,
      actual:
        node.field === "text"
          ? undefined
          : showValue(node.field, fieldValue(ctx, node.field)),
    };
  }
  const children = node.children.map((c) => explain(c, ctx));
  const pass =
    !children.length ||
    (node.op === "AND"
      ? children.every((c) => c.pass)
      : children.some((c) => c.pass));
  return {
    kind: "group",
    op: node.op,
    pass,
    label: node.op === "AND" ? "Alle voorwaarden" : "Minstens één van",
    children,
  };
}

/** Vlakke lijst van de voorwaarden die de advertentie doen falen (kort, voor lijstweergave). */
export function failedReasons(e: Explained): string[] {
  if (e.pass) return [];
  if (e.kind === "condition") return [`${e.label} — nu: ${e.actual}`];
  const kids = e.children ?? [];
  if (e.op === "AND") return kids.flatMap(failedReasons);
  // OR: alle takken faalden; toon per tak de belangrijkste reden
  return kids.length
    ? [
        `Geen van de alternatieven voldoet: ${kids.map((k) => (k.kind === "group" ? `(${failedReasons(k).join("; ")})` : `${k.label} — nu: ${k.actual}`)).join(" OF ")}`,
      ]
    : [];
}

const operators = [
  "eq",
  "neq",
  "in",
  "nin",
  "gte",
  "lte",
  "gt",
  "lt",
  "between",
  "gte_if_known",
  "lte_if_known",
  "containsAny",
  "containsAll",
  "containsNone",
  "isTrue",
  "isFalse",
  "isKnown",
] as const;
const validFields = new Set(FIELD_DEFS.map((f) => f.key));

export const conditionSchema = z.object({
  field: z.string().refine((f) => validFields.has(f), "Onbekend veld"),
  operator: z.enum(operators),
  value: z.any().optional(),
});

export const groupSchema: z.ZodType<Group> = z.lazy(() =>
  z.object({
    op: z.enum(["AND", "OR"]),
    children: z.array(z.union([groupSchema, conditionSchema])).max(60),
  }),
);

export function describeNode(n: Node): string {
  if (isGroup(n))
    return n.children.length
      ? "(" +
          n.children
            .map(describeNode)
            .join(` ${n.op === "AND" ? "EN" : "OF"} `) +
          ")"
      : "alles";
  const f = FIELD_DEFS.find((x) => x.key === n.field);
  return `${f?.label ?? n.field} ${n.operator} ${Array.isArray(n.value) ? n.value.join("/") : String(n.value ?? "")}`;
}
