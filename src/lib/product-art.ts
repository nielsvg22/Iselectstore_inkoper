/** Productvisuals (vectoren in /public/products) per productfamilie. */
export type ArtKey = "iphone" | "macbook" | "airpods" | "ipad" | "watch";

const MAP: Record<string, ArtKey> = {
  iphone: "iphone",
  macbook: "macbook",
  macbook_air: "macbook",
  macbook_pro: "macbook",
  airpods: "airpods",
  ipad: "ipad",
  watch: "watch",
};

export const ART_LABEL: Record<ArtKey, string> = { iphone: "iPhone", macbook: "MacBook", airpods: "AirPods", ipad: "iPad", watch: "Apple Watch" };

export function artFor(family: string | null | undefined): ArtKey | null {
  return (family && MAP[family]) || null;
}

export const artSrc = (k: ArtKey) => `/products/${k}.svg`;

/** Groepen voor categoriefilters (familie → gedeelde categorie). */
export const CATEGORY_GROUPS: Array<{ id: string; label: string; families: string[]; art: ArtKey | null }> = [
  { id: "iphone", label: "iPhone", families: ["iphone"], art: "iphone" },
  { id: "macbook", label: "MacBook", families: ["macbook_air", "macbook_pro", "macbook"], art: "macbook" },
  { id: "airpods", label: "AirPods", families: ["airpods"], art: "airpods" },
  { id: "ipad", label: "iPad", families: ["ipad"], art: "ipad" },
  { id: "watch", label: "Apple Watch", families: ["watch"], art: "watch" },
  { id: "more", label: "Overig Apple", families: ["mac_mini", "imac", "mac_studio", "accessory"], art: null },
];

export const familiesOf = (id: string | undefined | null): string[] | undefined => (id ? CATEGORY_GROUPS.find((g) => g.id === id)?.families : undefined);
