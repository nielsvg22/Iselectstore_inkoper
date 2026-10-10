import type { Family } from "../types";

/**
 * Volledige lijst Apple-producten (apparaten + accessoires) waarop gezocht en gefilterd kan worden.
 * `key` is de modelsleutel van de herkenning, `term` de Marktplaats-zoekterm. De test
 * `catalog.test.ts` bewijst dat elke zoekterm weer op dezelfde sleutel uitkomt.
 */
export interface CatalogModel {
  key: string;
  label: string;
  family: Family;
  /** Groepskop in de keuzelijst, bijv. "iPhone 15" of "MacBook Pro" */
  group: string;
  /** Zoekterm voor Marktplaats */
  term: string;
  /** Standaardcategorie op Marktplaats ("" = alle categorieën) */
  category: string;
}

export const CAT = {
  iphone: "telecommunicatie/mobiele-telefoons-apple-iphone",
  ipad: "computers-en-software/apple-ipads",
  macbook: "computers-en-software/apple-macbooks",
  desktop: "computers-en-software/apple-desktops",
  watch: "sieraden-tassen-en-uiterlijk/smartwatches",
} as const;

const m = (key: string, label: string, family: Family, group: string, term: string, category: string): CatalogModel => ({ key, label, family, group, term, category });

function iphones(): CatalogModel[] {
  const out: CatalogModel[] = [];
  const add = (gen: string, variants: Array<[string, string]>) => {
    for (const [suffix, name] of variants) {
      const key = `iphone-${gen}${suffix ? "-" + suffix : ""}`;
      const label = `iPhone ${gen.replace("-", " ")}${name ? " " + name : ""}`.replace(/iPhone (\d+)e/, "iPhone $1e");
      out.push(m(key, label, "iphone", `iPhone ${gen.replace(/e$/, "")}`, label.toLowerCase(), CAT.iphone));
    }
  };
  add("11", [["", ""], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  add("12", [["mini", "mini"], ["", ""], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  add("13", [["mini", "mini"], ["", ""], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  add("14", [["", ""], ["plus", "Plus"], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  add("15", [["", ""], ["plus", "Plus"], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  add("16", [["", ""], ["plus", "Plus"], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  add("17", [["", ""], ["pro", "Pro"], ["pro-max", "Pro Max"]]);
  out.push(m("iphone-16e", "iPhone 16e", "iphone", "iPhone 16", "iphone 16e", CAT.iphone));
  out.push(m("iphone-air", "iPhone Air", "iphone", "iPhone 17", "iphone air", CAT.iphone));
  out.push(m("iphone-se-2", "iPhone SE (2e generatie, 2020)", "iphone", "iPhone SE", "iphone se 2020", CAT.iphone));
  out.push(m("iphone-se-3", "iPhone SE (3e generatie, 2022)", "iphone", "iPhone SE", "iphone se 2022", CAT.iphone));
  return out;
}

function macs(): CatalogModel[] {
  const out: CatalogModel[] = [];
  const air: Array<[string, string, string]> = [
    ["macbook-air-intel-13", "MacBook Air 13″ Intel", "macbook air intel 13 inch"],
    ["macbook-air-m1-13", "MacBook Air 13″ M1", "macbook air m1 13 inch"],
    ["macbook-air-m2-13", "MacBook Air 13″ M2", "macbook air m2 13 inch"],
    ["macbook-air-m2-15", "MacBook Air 15″ M2", "macbook air m2 15 inch"],
    ["macbook-air-m3-13", "MacBook Air 13″ M3", "macbook air m3 13 inch"],
    ["macbook-air-m3-15", "MacBook Air 15″ M3", "macbook air m3 15 inch"],
    ["macbook-air-m4-13", "MacBook Air 13″ M4", "macbook air m4 13 inch"],
    ["macbook-air-m4-15", "MacBook Air 15″ M4", "macbook air m4 15 inch"],
  ];
  for (const [k, l, t] of air) out.push(m(k, l, "macbook_air", "MacBook Air", t, CAT.macbook));
  const pro: Array<[string, string, string]> = [
    ["macbook-pro-intel-13", "MacBook Pro 13″ Intel", "macbook pro intel 13 inch"],
    ["macbook-pro-intel-15", "MacBook Pro 15″ Intel", "macbook pro intel 15 inch"],
    ["macbook-pro-intel-16", "MacBook Pro 16″ Intel", "macbook pro intel 16 inch"],
    ["macbook-pro-m1-13", "MacBook Pro 13″ M1", "macbook pro m1 13 inch"],
    ["macbook-pro-m1-pro-14", "MacBook Pro 14″ M1 Pro", "macbook pro m1 pro 14 inch"],
    ["macbook-pro-m1-pro-16", "MacBook Pro 16″ M1 Pro", "macbook pro m1 pro 16 inch"],
    ["macbook-pro-m1-max-14", "MacBook Pro 14″ M1 Max", "macbook pro m1 max 14 inch"],
    ["macbook-pro-m1-max-16", "MacBook Pro 16″ M1 Max", "macbook pro m1 max 16 inch"],
    ["macbook-pro-m2-13", "MacBook Pro 13″ M2", "macbook pro m2 13 inch"],
    ["macbook-pro-m2-pro-14", "MacBook Pro 14″ M2 Pro", "macbook pro m2 pro 14 inch"],
    ["macbook-pro-m2-pro-16", "MacBook Pro 16″ M2 Pro", "macbook pro m2 pro 16 inch"],
    ["macbook-pro-m2-max-14", "MacBook Pro 14″ M2 Max", "macbook pro m2 max 14 inch"],
    ["macbook-pro-m2-max-16", "MacBook Pro 16″ M2 Max", "macbook pro m2 max 16 inch"],
    ["macbook-pro-m3-14", "MacBook Pro 14″ M3", "macbook pro m3 14 inch"],
    ["macbook-pro-m3-pro-14", "MacBook Pro 14″ M3 Pro", "macbook pro m3 pro 14 inch"],
    ["macbook-pro-m3-pro-16", "MacBook Pro 16″ M3 Pro", "macbook pro m3 pro 16 inch"],
    ["macbook-pro-m3-max-14", "MacBook Pro 14″ M3 Max", "macbook pro m3 max 14 inch"],
    ["macbook-pro-m3-max-16", "MacBook Pro 16″ M3 Max", "macbook pro m3 max 16 inch"],
    ["macbook-pro-m4-14", "MacBook Pro 14″ M4", "macbook pro m4 14 inch"],
    ["macbook-pro-m4-pro-14", "MacBook Pro 14″ M4 Pro", "macbook pro m4 pro 14 inch"],
    ["macbook-pro-m4-pro-16", "MacBook Pro 16″ M4 Pro", "macbook pro m4 pro 16 inch"],
    ["macbook-pro-m4-max-14", "MacBook Pro 14″ M4 Max", "macbook pro m4 max 14 inch"],
    ["macbook-pro-m4-max-16", "MacBook Pro 16″ M4 Max", "macbook pro m4 max 16 inch"],
  ];
  for (const [k, l, t] of pro) out.push(m(k, l, "macbook_pro", "MacBook Pro", t, CAT.macbook));
  const desk: Array<[string, string, Family, string, string]> = [
    ["mac-mini-intel", "Mac mini Intel", "mac_mini", "Mac mini", "mac mini intel"],
    ["mac-mini-m1", "Mac mini M1", "mac_mini", "Mac mini", "mac mini m1"],
    ["mac-mini-m2", "Mac mini M2", "mac_mini", "Mac mini", "mac mini m2"],
    ["mac-mini-m2-pro", "Mac mini M2 Pro", "mac_mini", "Mac mini", "mac mini m2 pro"],
    ["mac-mini-m4", "Mac mini M4", "mac_mini", "Mac mini", "mac mini m4"],
    ["mac-mini-m4-pro", "Mac mini M4 Pro", "mac_mini", "Mac mini", "mac mini m4 pro"],
    ["imac-m1-24", "iMac 24″ M1", "imac", "iMac", "imac m1 24 inch"],
    ["imac-m3-24", "iMac 24″ M3", "imac", "iMac", "imac m3 24 inch"],
    ["imac-m4-24", "iMac 24″ M4", "imac", "iMac", "imac m4 24 inch"],
    ["imac-intel-27", "iMac 27″ Intel", "imac", "iMac", "imac intel 27 inch"],
    ["imac-intel-21", "iMac 21,5″ Intel", "imac", "iMac", "imac intel 21,5 inch"],
    ["mac-studio-m1-max", "Mac Studio M1 Max", "mac_studio", "Mac Studio", "mac studio m1 max"],
    ["mac-studio-m1-ultra", "Mac Studio M1 Ultra", "mac_studio", "Mac Studio", "mac studio m1 ultra"],
    ["mac-studio-m2-max", "Mac Studio M2 Max", "mac_studio", "Mac Studio", "mac studio m2 max"],
    ["mac-studio-m2-ultra", "Mac Studio M2 Ultra", "mac_studio", "Mac Studio", "mac studio m2 ultra"],
    ["mac-studio-m3-ultra", "Mac Studio M3 Ultra", "mac_studio", "Mac Studio", "mac studio m3 ultra"],
    ["mac-studio-m4-max", "Mac Studio M4 Max", "mac_studio", "Mac Studio", "mac studio m4 max"],
  ];
  for (const [k, l, f, g, t] of desk) out.push(m(k, l, f, g, t, CAT.desktop));
  return out;
}

function others(): CatalogModel[] {
  const out: CatalogModel[] = [];
  const ipads: Array<[string, string, string, string]> = [
    ["ipad-pro-11-m1", "iPad Pro 11″ M1", "iPad Pro", "ipad pro 11 inch m1"],
    ["ipad-pro-11-m2", "iPad Pro 11″ M2", "iPad Pro", "ipad pro 11 inch m2"],
    ["ipad-pro-11-m4", "iPad Pro 11″ M4", "iPad Pro", "ipad pro 11 inch m4"],
    ["ipad-pro-12_9-m1", "iPad Pro 12,9″ M1", "iPad Pro", "ipad pro 12.9 inch m1"],
    ["ipad-pro-12_9-m2", "iPad Pro 12,9″ M2", "iPad Pro", "ipad pro 12.9 inch m2"],
    ["ipad-pro-13-m4", "iPad Pro 13″ M4", "iPad Pro", "ipad pro 13 inch m4"],
    ["ipad-air-4", "iPad Air (4e generatie)", "iPad Air", "ipad air 4e generatie"],
    ["ipad-air-5", "iPad Air (5e generatie)", "iPad Air", "ipad air 5e generatie"],
    ["ipad-air-m2", "iPad Air M2", "iPad Air", "ipad air m2"],
    ["ipad-air-m3", "iPad Air M3", "iPad Air", "ipad air m3"],
    ["ipad-mini-5", "iPad mini (5e generatie)", "iPad mini", "ipad mini 5e generatie"],
    ["ipad-mini-6", "iPad mini (6e generatie)", "iPad mini", "ipad mini 6e generatie"],
    ["ipad-mini-7", "iPad mini (7e generatie)", "iPad mini", "ipad mini 7e generatie"],
    ["ipad-8", "iPad (8e generatie)", "iPad", "ipad 8e generatie"],
    ["ipad-9", "iPad (9e generatie)", "iPad", "ipad 9e generatie"],
    ["ipad-10", "iPad (10e generatie)", "iPad", "ipad 10e generatie"],
  ];
  for (const [k, l, g, t] of ipads) out.push(m(k, l, "ipad", g, t, CAT.ipad));
  for (const n of [6, 7, 8, 9, 10]) out.push(m(`watch-series-${n}`, `Apple Watch Series ${n}`, "watch", "Apple Watch", `apple watch series ${n}`, CAT.watch));
  out.push(m("watch-se-1", "Apple Watch SE (1e generatie)", "watch", "Apple Watch", "apple watch se 1", CAT.watch));
  out.push(m("watch-se-2", "Apple Watch SE (2e generatie)", "watch", "Apple Watch", "apple watch se 2", CAT.watch));
  for (const n of [1, 2, 3]) out.push(m(`watch-ultra-${n}`, `Apple Watch Ultra ${n}`, "watch", "Apple Watch", `apple watch ultra ${n}`, CAT.watch));
  const pods: Array<[string, string, string]> = [
    ["airpods-2", "AirPods (2e generatie)", "airpods 2"],
    ["airpods-3", "AirPods (3e generatie)", "airpods 3"],
    ["airpods-4", "AirPods 4", "airpods 4"],
    ["airpods-pro", "AirPods Pro (1e generatie)", "airpods pro"],
    ["airpods-pro-2", "AirPods Pro 2", "airpods pro 2"],
    ["airpods-pro-3", "AirPods Pro 3", "airpods pro 3"],
    ["airpods-max", "AirPods Max", "airpods max"],
  ];
  for (const [k, l, t] of pods) out.push(m(k, l, "airpods", "AirPods", t, ""));
  const acc: Array<[string, string, string]> = [
    ["accessory-apple-pencil-1", "Apple Pencil (1e generatie)", "apple pencil 1e generatie"],
    ["accessory-apple-pencil-2", "Apple Pencil (2e generatie)", "apple pencil 2e generatie"],
    ["accessory-apple-pencil-usbc", "Apple Pencil (USB-C)", "apple pencil usb-c"],
    ["accessory-magic-keyboard", "Magic Keyboard", "magic keyboard"],
    ["accessory-magic-mouse", "Magic Mouse", "magic mouse"],
    ["accessory-magic-trackpad", "Magic Trackpad", "magic trackpad"],
    ["accessory-airtag", "AirTag", "airtag"],
    ["accessory-homepod", "HomePod", "homepod"],
    ["accessory-apple-tv", "Apple TV", "apple tv"],
  ];
  for (const [k, l, t] of acc) out.push(m(k, l, "accessory", "Accessoires", t, ""));
  return out;
}

export const APPLE_MODELS: CatalogModel[] = [...iphones(), ...macs(), ...others()];

export const FAMILY_LABEL: Record<string, string> = {
  iphone: "iPhone",
  macbook_air: "MacBook Air",
  macbook_pro: "MacBook Pro",
  ipad: "iPad",
  watch: "Apple Watch",
  airpods: "AirPods",
  mac_mini: "Mac mini",
  imac: "iMac",
  mac_studio: "Mac Studio",
  accessory: "Accessoires",
};

export const modelByKey = (key: string): CatalogModel | undefined => APPLE_MODELS.find((x) => x.key === key);

/** Zoektermen + meest voorkomende categorie voor een selectie modellen. */
export function searchPlanFor(keys: string[]): { queries: string[]; category: string } {
  const picked = keys.map(modelByKey).filter((x): x is CatalogModel => !!x);
  const cats = [...new Set(picked.map((p) => p.category))];
  return { queries: picked.map((p) => p.term), category: cats.length === 1 ? cats[0] : "" };
}
