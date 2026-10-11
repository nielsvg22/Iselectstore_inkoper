import type { FilterContext } from "../engines/filters";

interface Row {
  askingCents: number;
  netProfitCents: number;
  roiPct: number;
  maxBidCents: number;
  score: number;
  blocked: boolean;
  costs?: unknown;
  ad: {
    title: string;
    description: string;
    sellerVerified?: boolean | null;
    askingPriceCents: number | null;
    location: string | null;
    distanceKm: number | null;
    publishedAt: Date | null;
    firstSeenAt: Date;
    shippingOptions: unknown;
    _count: { images: number };
    risk: { level: string; score: number; blocked: boolean } | null;
    product: { family: string; modelKey: string; modelLabel: string; conditionGrade: string | null; specs: Array<{ key: string; value: string; source: string }> } | null;
  };
}

const DEFECT_VALUES = ["SCREEN_DAMAGE", "BACK_DAMAGE", "CAMERA_DAMAGE", "SEVERE_DEFECT", "WATER_DAMAGE", "FOR_PARTS"];

/** Bouwt de filtercontext uit opgeslagen database-rijen (voor eigen filters op het dashboard). */
export function contextFromRow(r: Row, now = new Date()): FilterContext {
  const specs = r.ad.product?.specs ?? [];
  const seller = (r.costs as { seller?: { level?: string; score?: number } } | null | undefined)?.seller;
  const shipping = (Array.isArray(r.ad.shippingOptions) ? r.ad.shippingOptions : []) as string[];
  const known = (k: string) => specs.find((s) => s.key === k && s.source !== "UNKNOWN");
  const num = (k: string) => {
    const v = known(k);
    return v && Number.isFinite(Number(v.value)) ? Number(v.value) : null;
  };
  const priceKnown = r.ad.askingPriceCents != null && r.ad.askingPriceCents > 0;
  const act = known("activationLock")?.value;
  const damage = known("damage")?.value ?? "";
  return {
    modelKey: r.ad.product?.modelKey ?? "unknown",
    family: r.ad.product?.family ?? "unknown",
    modelLabel: r.ad.product?.modelLabel ?? r.ad.title,
    storageGb: num("storageGb"),
    ramGb: num("ramGb"),
    batteryHealth: num("batteryHealth"),
    askingCents: r.ad.askingPriceCents,
    expectedProfitCents: priceKnown ? r.netProfitCents : null,
    roiPct: priceKnown ? r.roiPct : null,
    maxBidCents: r.maxBidCents,
    distanceKm: r.ad.distanceKm,
    ageHours: ((now.getTime() - (r.ad.publishedAt ?? r.ad.firstSeenAt).getTime()) / 3600_000),
    text: `${r.ad.title} ${r.ad.description}`.toLowerCase(),
    photoCount: r.ad._count.images,
    descriptionLength: r.ad.description.length,
    shipping,
    condition: r.ad.product?.conditionGrade ?? null,
    hasDefect: DEFECT_VALUES.some((d) => damage.includes(d)),
    activationLock: act === "locked" || act === "clear" ? act : null,
    mdm: known("mdm")?.value === "yes",
    score: r.score,
    riskScore: r.ad.risk?.score ?? null,
    riskLevel: r.ad.risk?.level ?? null,
    blocked: r.blocked,
    location: r.ad.location,
    sellerTrust: seller && seller.level !== "UNKNOWN" && typeof seller.score === "number" ? seller.score : null,
    sellerTrustLevel: seller?.level ?? null,
    sellerVerified: r.ad.sellerVerified ?? null,
    shippingAvailable: shipping.includes("shipping"),
    pickupAvailable: shipping.includes("pickup") || !shipping.length,
    batteryKnown: num("batteryHealth") != null,
    purchaseProof: /aankoopbewijs|factuur|kassabon|aankoopbon/i.test(`${r.ad.title} ${r.ad.description}`) ? "yes" : null,
  };
}
