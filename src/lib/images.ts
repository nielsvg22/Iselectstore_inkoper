/**
 * Marktplaats-foto's hebben een maatcode in de URL (`...?rule=ecg_mp_eps$_82.jpg`).
 * Gemeten: 82 = 147×196 (miniatuur), 83 = 358×477, 84 = 498×664, 85 = 726×968, 86 = 768×1024.
 * Zoekresultaten leveren 82; daarom schalen we op voor scherpe weergave (ook voor reeds opgeslagen advertenties).
 */
export type ImageSize = "thumb" | "card" | "full";
const CODE: Record<ImageSize, string> = { thumb: "83", card: "85", full: "86" };

export function hiRes(url: string | null | undefined, size: ImageSize = "full"): string {
  if (!url) return "";
  if (!/^https?:\/\/images\.marktplaats\.com\//.test(url)) return url;
  return url.replace(/\$_(?:\d+|#)(\.[A-Za-z]+)?$/, (_m, ext) => `$_${CODE[size]}${ext ?? ".jpg"}`);
}
