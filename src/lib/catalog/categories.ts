import { CAT } from "./apple";

/**
 * Apple-gerelateerde Marktplaats-categorieën. Opgehaald (live) uit de categoriefacetten van
 * de zoekresultaten voor Apple-zoektermen op 2026-10-10; te vernieuwen via Instellingen.
 * `group: device` = categorieën met Apple-apparaten, `accessory` = accessoires/onderdelen.
 */
export interface MarktplaatsCategory {
  path: string;
  label: string;
  group: "device" | "accessory";
  /** Aantal advertenties bij de Apple-zoektermen op het ophaalmoment */
  count?: number;
}

export const APPLE_CATEGORIES: MarktplaatsCategory[] = [
  { path: CAT.iphone, label: "Apple iPhones", group: "device", count: 19990 },
  { path: CAT.ipad, label: "Apple iPads", group: "device", count: 5398 },
  { path: CAT.macbook, label: "Apple MacBooks", group: "device", count: 4415 },
  { path: CAT.desktop, label: "Apple desktops (iMac, Mac mini, Mac Studio)", group: "device", count: 2361 },
  { path: CAT.watch, label: "Smartwatches (Apple Watch)", group: "device", count: 4768 },
  { path: "audio-tv-en-foto/koptelefoons", label: "Koptelefoons (AirPods)", group: "device", count: 2314 },
  { path: "telecommunicatie/mobiele-telefoons-oordopjes", label: "Oordopjes (AirPods)", group: "device", count: 1570 },
  { path: "telecommunicatie/mobiele-telefoons-hoesjes-en-frontjes-apple-iphone", label: "Hoesjes en frontjes Apple iPhone", group: "accessory", count: 8069 },
  { path: "telecommunicatie/mobiele-telefoons-toebehoren-en-onderdelen", label: "Telefoon-toebehoren en -onderdelen", group: "accessory", count: 5146 },
  { path: "telecommunicatie/wearable-accessoires", label: "Wearable-accessoires", group: "accessory", count: 1350 },
  { path: "telecommunicatie/mobiele-telefoons-telefoon-opladers", label: "Telefoon-opladers", group: "accessory", count: 1120 },
  { path: "computers-en-software/toetsenborden", label: "Toetsenborden (Magic Keyboard)", group: "accessory", count: 863 },
  { path: "computers-en-software/tablet-hoezen", label: "Tablet-hoezen", group: "accessory", count: 962 },
  { path: "computers-en-software/overige-computers-en-software", label: "Overige computers en software", group: "accessory", count: 643 },
  { path: "telecommunicatie/overige-telecommunicatie", label: "Overige telecommunicatie", group: "accessory", count: 746 },
];
