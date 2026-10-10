export type Family =
  | "iphone"
  | "macbook_air"
  | "macbook_pro"
  | "macbook"
  | "ipad"
  | "watch"
  | "airpods"
  | "mac_mini"
  | "imac"
  | "mac_studio"
  | "accessory"
  | "unknown";

export type FactSource = "CONFIRMED" | "SELLER_CLAIM" | "AI_ESTIMATE" | "UNKNOWN";

export interface Fact<T = string | number | boolean> {
  value: T | null;
  source: FactSource;
  evidence?: string;
}

export type SignalCode =
  | "ACTIVATION_LOCK"
  | "ACTIVATION_CLEAR_CLAIM"
  | "ACTIVATION_MENTIONED_UNCLEAR"
  | "MDM"
  | "SIMLOCK"
  | "SIMLOCK_CLEAR_CLAIM"
  | "STOLEN_MENTION"
  | "OWNERSHIP_UNCLEAR"
  | "NO_PURCHASE_PROOF"
  | "BLOCKED_IMEI"
  | "SEVERE_DEFECT"
  | "FOR_PARTS"
  | "WATER_DAMAGE"
  | "SCREEN_DAMAGE"
  | "BACK_DAMAGE"
  | "CAMERA_DAMAGE"
  | "COSMETIC_DAMAGE"
  | "NON_ORIGINAL_PARTS"
  | "REPAIRED"
  | "BATTERY_SERVICE"
  | "PREPAYMENT_REQUEST"
  | "PROMPT_INJECTION"
  | "SHIPPING_ONLY_SCAM"
  | "NO_FUNCTIONAL_CLAIM";

export interface Signal {
  code: SignalCode;
  evidence: string;
}

export interface Recognition {
  family: Family;
  modelKey: string;
  modelLabel: string;
  confidence: number;
  recognizedBy: "rules" | "ai" | "rules+ai";
  outOfScope?: boolean;
  /** key -> fact. keys: storageGb, ramGb, color, batteryHealth, chip, screenInch, cycles, year, connectivity, sizeMm, condition */
  facts: Record<string, Fact>;
  signals: Signal[];
  conditionGrade: "A" | "B" | "C" | null;
  /** Spec-sleutels waarvan de waarde ontbreekt maar relevant is */
  unknown: string[];
}

export interface Comparable {
  priceCents: number;
  kind: "ASKING_CURRENT" | "ASKING_HISTORIC" | "REALIZED";
  storageGb?: number | null;
  ramGb?: number | null;
  batteryHealth?: number | null;
  observedAt: Date;
}

export type DealBandKey = "TOP" | "VERY_INTERESTING" | "INTERESTING" | "MODERATE" | "NOT_INTERESTING";
export type RiskLevelKey = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export interface RiskFlag {
  code: string;
  label: string;
  severity: "info" | "warn" | "high" | "block";
  points: number;
  evidence?: string;
}
