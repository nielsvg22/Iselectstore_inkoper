import type { Group } from "../engines/filters";

/** Één zichtbare radar; onbekende afstand of verkopergegevens geven géén remote-goedkeuring. */
export const APELDOORN_RADAR_NAME = "iSelect Inkoopradar · Apeldoorn";
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
    { field: "family", operator: "in", value: ["iphone", "macbook_air", "macbook_pro", "ipad", "watch", "airpods"] },
    { field: "hasDefect", operator: "isFalse" },
    {
      op: "OR",
      children: [
        { field: "distanceKm", operator: "lte", value: APELDOORN_RADIUS_KM },
        {
          op: "AND",
          children: [
            { field: "distanceKm", operator: "gt", value: APELDOORN_RADIUS_KM },
            { field: "shippingAvailable", operator: "isTrue" },
            { field: "sellerRating", operator: "gte", value: 4.6 },
            { field: "sellerReviewCount", operator: "gte", value: 15 },
            { field: "sellerAgeMonths", operator: "gte", value: 12 },
            { field: "sellerTrustLevel", operator: "in", value: ["HIGH"] },
          ],
        },
      ],
    },
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
    { field: "sellerTrustLevel", operator: "in", value: ["HIGH"] },
  ],
};

export const priorityRadarTree: Group = {
  op: "AND",
  children: [
    apeldoornRadarTree,
    { field: "score", operator: "gte", value: 80 },
    { field: "expectedProfitEuro", operator: "gte", value: 75 },
  ],
};
