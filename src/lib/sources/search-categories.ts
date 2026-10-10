import { APPLE_CATEGORIES } from "../catalog/categories";

/** Categoriekeuze voor zoekprofielen: "Alle categorieën" + de Apple-apparaatcategorieën. */
export const KNOWN_CATEGORIES: Array<{ path: string; label: string }> = [
  { path: "", label: "Alle categorieën" },
  ...APPLE_CATEGORIES.filter((c) => c.group === "device").map((c) => ({ path: c.path, label: c.label })),
];
