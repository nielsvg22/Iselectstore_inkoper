import { describe, expect, it } from "vitest";
import { evaluate, groupSchema, type FilterContext, type Group } from "@/lib/engines/filters";
import { contentHash, findDuplicate, fingerprint, jaccard } from "@/lib/engines/dedupe";

const ctx = (o: Partial<FilterContext> = {}): FilterContext => ({
  modelKey: "iphone-15-pro", family: "iphone", modelLabel: "iPhone 15 Pro", storageGb: 256, ramGb: null, batteryHealth: 91, askingCents: 35000, expectedProfitCents: 15000, roiPct: 42.9,
  maxBidCents: 40000, distanceKm: 34, ageHours: 2, text: "iphone 15 pro 256gb icloud vrij", photoCount: 3, descriptionLength: 120, shipping: ["pickup", "shipping"], condition: "A",
  hasDefect: false, activationLock: "clear", mdm: false, score: 93, riskScore: 10, riskLevel: "LOW", blocked: false, location: "Utrecht",
  sellerTrust: null, sellerTrustLevel: "UNKNOWN", sellerVerified: null, shippingAvailable: true, pickupAvailable: true, batteryKnown: true, purchaseProof: null, ...o,
});

const profileTree: Group = {
  op: "AND",
  children: [
    { field: "modelKey", operator: "in", value: ["iphone-15-pro"] },
    { field: "storageGb", operator: "in", value: [128, 256] },
    { field: "askingEuro", operator: "lte", value: 400 },
    { field: "expectedProfitEuro", operator: "gte", value: 100 },
    { field: "roiPct", operator: "gte", value: 25 },
    { field: "distanceKm", operator: "lte", value: 100 },
    { field: "batteryHealth", operator: "gte_if_known", value: 85 },
    { field: "hasDefect", operator: "isFalse" },
    { field: "activationLock", operator: "neq", value: "locked" },
    { field: "photoCount", operator: "gte", value: 1 },
  ],
};

describe("zoekfilters", () => {
  it("het voorbeeldprofiel 'iPhone 15 Pro inkoop' matcht een passende advertentie", () => {
    expect(evaluate(profileTree, ctx())).toBe(true);
  });
  it.each([
    ["te duur", { askingCents: 45000 }],
    ["te weinig winst", { expectedProfitCents: 5000 }],
    ["te laag rendement", { roiPct: 10 }],
    ["te ver", { distanceKm: 250 }],
    ["batterij te laag", { batteryHealth: 80 }],
    ["defect", { hasDefect: true }],
    ["icloud-vergrendeld", { activationLock: "locked" as const }],
    ["geen foto's", { photoCount: 0 }],
    ["verkeerd model", { modelKey: "iphone-14-pro" }],
    ["verkeerde opslag", { storageGb: 512 }],
  ])("matcht niet: %s", (_n, o) => {
    expect(evaluate(profileTree, ctx(o))).toBe(false);
  });
  it("'indien bekend' laat onbekende batterij door", () => {
    expect(evaluate(profileTree, ctx({ batteryHealth: null }))).toBe(true);
  });
  it("ondersteunt geneste AND/OR-logica", () => {
    const t: Group = { op: "AND", children: [{ op: "OR", children: [{ field: "modelKey", operator: "eq", value: "iphone-14" }, { field: "modelKey", operator: "eq", value: "iphone-15-pro" }] }, { field: "askingEuro", operator: "between", value: [300, 400] }] };
    expect(evaluate(t, ctx())).toBe(true);
    expect(evaluate(t, ctx({ modelKey: "iphone-13" }))).toBe(false);
    expect(evaluate(t, ctx({ askingCents: 20000 }))).toBe(false);
  });
  it("trefwoorden: inclusief en uitsluitend", () => {
    expect(evaluate({ field: "text", operator: "containsAny", value: ["256gb", "512gb"] }, ctx())).toBe(true);
    expect(evaluate({ field: "text", operator: "containsAll", value: ["icloud", "256gb"] }, ctx())).toBe(true);
    expect(evaluate({ field: "text", operator: "containsNone", value: ["defect", "kapot"] }, ctx())).toBe(true);
    expect(evaluate({ field: "text", operator: "containsNone", value: ["icloud"] }, ctx())).toBe(false);
  });
  it("verzending of ophalen, leeftijd, score en risico", () => {
    expect(evaluate({ field: "shipping", operator: "containsAny", value: ["shipping"] }, ctx())).toBe(true);
    expect(evaluate({ field: "shipping", operator: "containsAny", value: ["shipping"] }, ctx({ shipping: ["pickup"] }))).toBe(false);
    expect(evaluate({ field: "ageHours", operator: "lte", value: 24 }, ctx())).toBe(true);
    expect(evaluate({ field: "score", operator: "gte", value: 90 }, ctx())).toBe(true);
    expect(evaluate({ field: "riskLevel", operator: "nin", value: ["HIGH", "BLOCKED"] }, ctx())).toBe(true);
  });
  it("lege groep matcht alles; OR zonder treffers niet", () => {
    expect(evaluate({ op: "AND", children: [] }, ctx())).toBe(true);
    expect(evaluate({ op: "OR", children: [{ field: "score", operator: "gte", value: 99 }] }, ctx())).toBe(false);
  });
  it("valideert regelbomen (onbekend veld wordt geweigerd)", () => {
    expect(groupSchema.safeParse(profileTree).success).toBe(true);
    expect(groupSchema.safeParse({ op: "AND", children: [{ field: "__proto__", operator: "eq", value: 1 }] }).success).toBe(false);
    expect(groupSchema.safeParse({ op: "XOR", children: [] }).success).toBe(false);
  });
});

describe("duplicaatdetectie", () => {
  const a = { id: "a", title: "iPhone 15 Pro 256GB zwart", askingCents: 70000, location: "Utrecht", imageUrls: ["https://img.example/12345.jpg", "https://img.example/67890.jpg"] };
  it("herkent dezelfde advertentie met andere id via foto's + titel", () => {
    const b = { id: "b", title: "iphone 15 pro 256gb zwart", askingCents: 68000, location: "Utrecht", imageUrls: ["https://cdn.other/12345.jpg?x=1"] };
    const d = findDuplicate(b, [a]);
    expect(d?.duplicateOfId).toBe("a");
  });
  it("herkent verschillende producten niet als duplicaat", () => {
    const c = { id: "c", title: "iPhone 13 128GB blauw", askingCents: 30000, location: "Rotterdam", imageUrls: ["https://img.example/999.jpg"] };
    expect(findDuplicate(c, [a])).toBeNull();
  });
  it("vingerafdruk is stabiel voor woordvolgorde en hoofdletters", () => {
    expect(fingerprint("iPhone 15 Pro 256GB", "iphone-15-pro", 256)).toBe(fingerprint("256GB iphone 15 pro", "iphone-15-pro", 256));
    expect(fingerprint("iPhone 15 Pro", "iphone-15-pro", 256)).not.toBe(fingerprint("iPhone 15 Pro", "iphone-15-pro", 512));
  });
  it("contentHash verandert bij prijswijziging", () => {
    const base = { title: "x", description: "y", askingCents: 100, imageUrls: ["a"] };
    expect(contentHash(base)).toBe(contentHash({ ...base }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, askingCents: 90 }));
  });
  it("jaccard", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });
});

import { buildTree as buildProfileTree, emptyQuick, quickToConditions, treeToQuick } from "@/lib/profile-quick";
import { FIELD_DEFS } from "@/lib/engines/filters";

describe("snelle filters <-> regelboom", () => {
  it("vertaalt het voorbeeldprofiel naar condities en terug", () => {
    const q = { ...emptyQuick(), models: ["iphone-15-pro"], storage: [128, 256], maxPrice: "400", minProfit: "100", minRoi: "25", maxDistance: "100", minBattery: "85", excludeDefects: true, excludeLocked: true, requirePhotos: true, requireInfo: true, maxRisk: "MEDIUM" as const };
    const tree = buildProfileTree(q, [{ op: "OR", conditions: [{ field: "text", operator: "containsAny", value: "pro max, 256gb" }] }], FIELD_DEFS);
    expect(tree.children).toHaveLength(quickToConditions(q).length + 1);
    const back = treeToQuick(tree);
    expect(back.quick).toEqual(q);
    expect(back.groups).toEqual([{ op: "OR", conditions: [{ field: "text", operator: "containsAny", value: "pro max, 256gb" }] }]);
    expect(evaluate(tree, ctx({ text: "iphone 15 pro 256gb" }))).toBe(true);
    expect(evaluate(tree, ctx({ text: "iphone 15 pro" }))).toBe(false);
  });
  it("onbekende condities blijven behouden als geavanceerde groep", () => {
    const back = treeToQuick({ op: "AND", children: [{ field: "family", operator: "eq", value: "iphone" }] });
    expect(back.groups[0].conditions[0]).toEqual({ field: "family", operator: "eq", value: "iphone" });
  });
});
