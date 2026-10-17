import type { Group } from "../engines/filters";

/** Één zichtbare radar; onbekende afstand of verkopergegevens geven géén remote-goedkeuring. */
export const APELDOORN_RADAR_NAME = "iSelectStore — Smart Inkoopradar";
export const APELDOORN_CENTER = "Apeldoorn";
export const APELDOORN_RADIUS_KM = 40;

/**
 * Eerst geografie en verkopersveiligheid; pas daarna dealanalyse.
 * Externe advertenties mogen alleen door wanneer de bron de review- en
 * accountgegevens aantoonbaar heeft geleverd.
 */
export const apeldoornRadarTree: Group = {
  op: "AND",
  children: [
    {
      field: "family",
      operator: "in",
      value: [
        "iphone",
        "macbook_air",
        "macbook_pro",
        "macbook",
        "mac_mini",
        "imac",
        "mac_studio",
        "ipad",
        "watch",
        "airpods",
      ],
    },
    { field: "blocked", operator: "isFalse" },
  ],
};

export const localRadarTree: Group = {
  op: "AND",
  children: [
    { field: "distanceKm", operator: "lte", value: APELDOORN_RADIUS_KM },
    { field: "hasDefect", operator: "isFalse" },
  ],
};

export const shippingRadarTree: Group = {
  op: "AND",
  children: [
    { field: "distanceKm", operator: "gt", value: APELDOORN_RADIUS_KM },
    { field: "shippingAvailable", operator: "isTrue" },
    { field: "sellerRating", operator: "gte", value: 4.6 },
    { field: "sellerReviewCount", operator: "gte", value: 15 },
    { field: "sellerAgeMonths", operator: "gte", value: 12 },
    { field: "blocked", operator: "isFalse" },
    { field: "riskLevel", operator: "nin", value: ["HIGH", "BLOCKED"] },
    { field: "riskScore", operator: "lte", value: 25 },
  ],
};

export const priorityRadarTree: Group = {
  op: "AND",
  children: [
    apeldoornRadarTree,
    { field: "valuationCertain", operator: "isTrue" },
    { field: "score", operator: "gte", value: 80 },
    { field: "expectedProfitEuro", operator: "gte", value: 75 },
  ],
};
