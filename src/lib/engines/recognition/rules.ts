import type { Fact, Family, Recognition } from "@/lib/types";
import { normalizeText } from "./normalize";
import { detectSignals } from "./signals";

const STORAGE_SET = new Set([16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]);
const RAM_SET = new Set([4, 8, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192]);

const COLORS: Array<[RegExp, string]> = [
  [/natural\s*titanium|naturel\s*titanium|titanium\s*naturel|natuurlijk titanium/, "Natural Titanium"],
  [/desert\s*titanium|woestijn\s*titanium/, "Desert Titanium"],
  [/blue\s*titanium|blauw\s*titanium/, "Blue Titanium"],
  [/white\s*titanium|wit\s*titanium/, "White Titanium"],
  [/black\s*titanium|zwart\s*titanium/, "Black Titanium"],
  [/space\s*(?:grey|gray|grijs)|ruimtegrijs/, "Space Grey"],
  [/space\s*black|space\s*zwart/, "Space Black"],
  [/sterrenlicht|starlight/, "Starlight"],
  [/middernacht|midnight/, "Midnight"],
  [/graphite|grafiet/, "Graphite"],
  [/sierra\s*blue|sierra\s*blauw/, "Sierra Blue"],
  [/alpine\s*green|alpine\s*groen/, "Alpine Green"],
  [/deep\s*purple|diep\s*paars/, "Deep Purple"],
  [/rose\s*gold|rosegoud|rose\s*goud/, "Rose Gold"],
  [/zilver|silver/, "Silver"],
  [/\bgoud\b|\bgold\b/, "Gold"],
  [/zwart|black/, "Black"],
  [/\bwit\b|white/, "White"],
  [/blauw|\bblue\b/, "Blue"],
  [/groen|green/, "Green"],
  [/geel|yellow/, "Yellow"],
  [/roze|pink/, "Pink"],
  [/rood|\bred\b|product\s*red/, "Red"],
  [/paars|purple/, "Purple"],
  [/grijs|\bgrey\b|\bgray\b/, "Grey"],
  [/oranje|orange/, "Orange"],
  [/teal|turquoise/, "Teal"],
  [/ultramarine/, "Ultramarine"],
];

const FAMILY_BASE_TITLE: Record<Family, string> = {
  iphone: "iPhone",
  macbook_air: "MacBook Air",
  macbook_pro: "MacBook Pro",
  macbook: "MacBook",
  ipad: "iPad",
  watch: "Apple Watch",
  airpods: "AirPods",
  mac_mini: "Mac mini",
  imac: "iMac",
  mac_studio: "Mac Studio",
  accessory: "Accessoire",
  unknown: "Onbekend Apple-product",
};

interface Partial {
  family: Family;
  modelKey: string;
  modelLabel: string;
  specificity: number; // 0..1
  outOfScope?: boolean;
}

const claim = (value: string | number | boolean, evidence: string): Fact => ({ value, source: "SELLER_CLAIM", evidence: evidence.trim().slice(0, 100) });

/* ------------------------------ model detectie ----------------------------- */

function chipOf(t: string): { key: string; label: string } | null {
  const m = /(?<![a-z0-9])m\s?([1-6])\s*(pro|max|ultra)?(?![a-z0-9])/.exec(t);
  if (!m) return null;
  const variant = m[2];
  return { key: `m${m[1]}${variant ? "-" + variant : ""}`, label: `M${m[1]}${variant ? " " + variant[0].toUpperCase() + variant.slice(1) : ""}` };
}

const isIntel = (t: string) => /\bintel\b|core\s*i[3579]|(?<![a-z0-9])i[3579]\s*-?\s*\d{3,5}|\bxeon\b/.test(t);

function detectIphone(t: string): Partial | null {
  const re = /iphone\s*(?:model\s*)?(se|xs|xr|x|air|\d{1,2})(e)?(?![a-z0-9])?\s*(pro\s*max|pro|plus|max|mini)?/;
  // 15pro: cijfers direct gevolgd door letters toestaan
  const re2 = /iphone\s*(se|xs|xr|x(?![a-z])|air|\d{1,2})\s*(e(?![a-z]))?\s*(pro\s*max|pro|plus|max|mini)?/;
  const m = re2.exec(t) ?? re.exec(t);
  if (!m) {
    if (/iphone/.test(t)) return { family: "iphone", modelKey: "iphone", modelLabel: "iPhone (model onbekend)", specificity: 0.1 };
    return null;
  }
  const num = m[1];
  const eSuffix = m[2] ? "e" : "";
  let variant = (m[3] ?? "").replace(/\s+/g, " ");
  if (num === "se") {
    const g = /iphone\s*se\s*(?:\(?\s*(2016|2020|2022)\s*\)?|([123])\s*(?:e|nd|rd|st|de)?\s*(?:gen\w*|generatie)?|gen(?:eratie)?\s*([123]))/.exec(t);
    const map: Record<string, number> = { "2016": 1, "2020": 2, "2022": 3 };
    const gen = g ? (g[1] ? map[g[1]] : Number(g[2] ?? g[3])) : 0;
    if (gen) return { family: "iphone", modelKey: `iphone-se-${gen}`, modelLabel: `iPhone SE (${gen}e gen)`, specificity: 1, outOfScope: false };
    return { family: "iphone", modelKey: "iphone-se", modelLabel: "iPhone SE (generatie onbekend)", specificity: 0.5 };
  }
  if (num === "air") return { family: "iphone", modelKey: "iphone-air", modelLabel: "iPhone Air", specificity: 1 };
  const legacy = ["x", "xs", "xr"];
  if (legacy.includes(num)) {
    if (num === "xs" && variant === "max") variant = "max";
    const key = `iphone-${num}${variant ? "-" + variant.replace(" ", "-") : ""}`;
    return { family: "iphone", modelKey: key, modelLabel: `iPhone ${num.toUpperCase()}${variant ? " " + cap(variant) : ""}`, specificity: 1, outOfScope: true };
  }
  const n = Number(num);
  if (!Number.isFinite(n) || n < 6 || n > 20) return { family: "iphone", modelKey: "iphone", modelLabel: "iPhone (model onbekend)", specificity: 0.15 };
  // "iphone 12 128" mag niet als "12 1.." worden gelezen; variant "max" zonder pro is ongeldig voor nummer-modellen
  if (variant === "max") variant = "pro max";
  const suffix = eSuffix ? "e" : "";
  const key = `iphone-${n}${suffix}${variant ? "-" + variant.replace(" ", "-") : ""}`;
  const label = `iPhone ${n}${suffix}${variant ? " " + cap(variant) : ""}`;
  return { family: "iphone", modelKey: key, modelLabel: label, specificity: 1, outOfScope: n < 11 };
}

const cap = (s: string) => s.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

function screenOf(t: string): number | null {
  const m = /(?<![0-9.,])(11|12|13(?:[.,][36])?|14|15(?:[.,]3)?|16|17|21[.,]5|24|27)\s*(?:inch|"|''|-inch|in\b)/.exec(t);
  if (!m) return null;
  // 13,6 → 13 en 21,5 → 21: sleutels gebruiken de afgeronde-naar-beneden maat
  return Math.floor(Number(m[1].replace(",", ".")));
}

function yearOf(t: string): number | null {
  const m = /(?<![0-9])(20(?:1[3-9]|2[0-6]))(?![0-9])/.exec(t);
  return m ? Number(m[1]) : null;
}

function detectMac(t: string): Partial | null {
  if (/macbook/.test(t)) {
    const fam: Family = /macbook\s*air/.test(t) ? "macbook_air" : /macbook\s*pro/.test(t) ? "macbook_pro" : "macbook";
    const chip = chipOf(t);
    const intel = !chip && isIntel(t);
    const screen = screenOf(t);
    const year = yearOf(t);
    if (/macbook\s*neo/.test(t)) {
      const size = screen ?? 13;
      return { family: "macbook", modelKey: `macbook-neo-${size}`, modelLabel: `MacBook Neo ${size}"`, specificity: 1 };
    }
    const baseKey = fam === "macbook_air" ? "macbook-air" : fam === "macbook_pro" ? "macbook-pro" : "macbook";
    const parts = [baseKey, chip ? chip.key : intel ? "intel" : null, screen ? String(screen) : null];
    if (intel && year) parts.push(String(year));
    const labelParts = [FAMILY_BASE_TITLE[fam], screen ? `${screen}"` : null, chip ? chip.label : intel ? `Intel${year ? " " + year : ""}` : null];
    const spec = (chip || intel ? 0.6 : 0.2) + (screen ? 0.2 : 0) + (fam !== "macbook" ? 0.2 : 0);
    return { family: fam, modelKey: parts.filter(Boolean).join("-"), modelLabel: labelParts.filter(Boolean).join(" "), specificity: Math.min(1, spec) };
  }
  if (/macmini/.test(t)) {
    const chip = chipOf(t);
    const intel = !chip && isIntel(t);
    return {
      family: "mac_mini",
      modelKey: ["mac-mini", chip?.key ?? (intel ? "intel" : null)].filter(Boolean).join("-"),
      modelLabel: ["Mac mini", chip?.label ?? (intel ? "Intel" : null)].filter(Boolean).join(" "),
      specificity: chip || intel ? 1 : 0.4,
    };
  }
  if (/macstudio/.test(t)) {
    const chip = chipOf(t);
    return { family: "mac_studio", modelKey: ["mac-studio", chip?.key].filter(Boolean).join("-"), modelLabel: ["Mac Studio", chip?.label].filter(Boolean).join(" "), specificity: chip ? 1 : 0.4 };
  }
  if (/\bimac\b/.test(t)) {
    const chip = chipOf(t);
    const intel = !chip && isIntel(t);
    const screen = screenOf(t);
    return {
      family: "imac",
      modelKey: ["imac", chip?.key ?? (intel ? "intel" : null), screen].filter(Boolean).join("-"),
      modelLabel: ["iMac", screen ? `${screen}"` : null, chip?.label ?? (intel ? "Intel" : null)].filter(Boolean).join(" "),
      specificity: (chip || intel ? 0.6 : 0.2) + (screen ? 0.4 : 0),
    };
  }
  return null;
}

function detectIpad(t: string): Partial | null {
  const m = /\bipad\s*(pro|air|mini)?/.exec(t);
  if (!m) return null;
  const variant = m[1] ?? "";
  const after = t.slice(m.index);
  const genM = /(\d{1,2})\s*(?:e|de|th|nd|rd|st)?\s*(?:gen\w*|generatie)|gen(?:eratie)?\s*(\d{1,2})/.exec(after);
  const gen = genM ? Number(genM[1] ?? genM[2]) : null;
  const sizeM = /(?<![0-9])(8[.,]3|9[.,]7|10[.,][2359]|11|12[.,]9|13)\s*(?:inch|"|''|-inch)?/.exec(after.replace(/\d+\s*(?:gb|tb)/g, ""));
  const size = sizeM ? sizeM[1].replace(",", ".") : null;
  const chip = chipOf(t);
  if (!variant && /(?<![a-z0-9])a16(?![a-z0-9])/.test(t)) return { family: "ipad", modelKey: "ipad-11", modelLabel: "iPad (A16)", specificity: 1 };
  const parts = ["ipad", variant || null];
  let spec = variant ? 0.5 : 0.3;
  if (variant === "pro") {
    if (size) parts.push(size.replace(".", "_"));
    if (chip) parts.push(chip.key);
    else if (gen) parts.push(`g${gen}`);
    else if (yearOf(t) === 2020) parts.push("2020");
    spec += (size ? 0.25 : 0) + (chip || gen || yearOf(t) === 2020 ? 0.25 : 0);
  } else {
    if (gen) parts.push(String(gen));
    else if (chip) parts.push(chip.key);
    spec += gen || chip ? 0.5 : 0;
  }
  const label = ["iPad", variant ? cap(variant) : null, variant === "pro" && size ? `${size}"` : null, gen && variant !== "pro" ? `(${gen}e gen)` : null, chip ? chip.label : null].filter(Boolean).join(" ");
  return { family: "ipad", modelKey: parts.filter(Boolean).join("-"), modelLabel: label, specificity: Math.min(1, spec) };
}

function detectWatch(t: string): Partial | null {
  if (!/applewatch|\bwatch\s*(?:series|serie|se\b|ultra)/.test(t)) return null;
  if (/ultra/.test(t)) {
    const g = /ultra\s*(\d)/.exec(t);
    const gen = g ? Number(g[1]) : /ultra\s*(?:2|ii)\b/.test(t) ? 2 : null;
    return { family: "watch", modelKey: gen ? `watch-ultra-${gen}` : "watch-ultra", modelLabel: `Apple Watch Ultra${gen ? " " + gen : ""}`, specificity: gen ? 1 : 0.6 };
  }
  const se = /\bse\b\s*(?:\(?\s*(2022|2020)\s*\)?|(2|1)(?:e|nd|st)?\s*(?:gen\w*)?)?/.exec(t.slice(t.search(/watch/)));
  if (se && /(?:watch)\s*se\b/.test(t)) {
    const gen = se[1] ? (se[1] === "2022" ? 2 : 1) : se[2] ? Number(se[2]) : null;
    return { family: "watch", modelKey: gen ? `watch-se-${gen}` : "watch-se", modelLabel: `Apple Watch SE${gen ? " (" + gen + "e gen)" : ""}`, specificity: gen ? 1 : 0.6 };
  }
  const s = /(?:series|serie|\bs)\s*(\d{1,2})\b/.exec(t) ?? /watch\s*(\d{1,2})\b/.exec(t);
  if (s && Number(s[1]) >= 1 && Number(s[1]) <= 12) return { family: "watch", modelKey: `watch-series-${s[1]}`, modelLabel: `Apple Watch Series ${s[1]}`, specificity: 1 };
  return { family: "watch", modelKey: "watch", modelLabel: "Apple Watch (model onbekend)", specificity: 0.2 };
}

function detectAirpods(t: string): Partial | null {
  if (!/airpods/.test(t)) return null;
  if (/airpods\s*max/.test(t)) return { family: "airpods", modelKey: "airpods-max", modelLabel: "AirPods Max", specificity: 1 };
  if (/airpods\s*pro/.test(t)) {
    const g2 = /airpods\s*pro\s*(?:2|ii)\b|pro\s*(?:2e|2nd|tweede)\s*gen|pro\s*gen(?:eratie)?\s*2|usb-?\s*c|2022|2023/.test(t);
    const g3 = /airpods\s*pro\s*3|pro\s*3e/.test(t);
    const g1 = /airpods\s*pro\s*(?:1|i)\b|pro\s*(?:1e|1st|eerste)\s*gen|magsafe\s*case.*2021/.test(t);
    const gen = g3 ? 3 : g2 ? 2 : g1 ? 1 : null;
    return { family: "airpods", modelKey: gen ? `airpods-pro-${gen}` : "airpods-pro", modelLabel: `AirPods Pro${gen ? " " + gen : ""}`, specificity: gen ? 1 : 0.6 };
  }
  const g = /airpods\s*(\d)\b|(\d)\s*(?:e|de|nd|rd|st|th)?\s*gen/.exec(t);
  const gen = g ? Number(g[1] ?? g[2]) : null;
  return { family: "airpods", modelKey: gen ? `airpods-${gen}` : "airpods", modelLabel: `AirPods${gen ? " " + gen : ""}`, specificity: gen ? 1 : 0.4 };
}

function detectAccessory(t: string): Partial | null {
  const defs: Array<[RegExp, string, string]> = [
    [/apple\s*pencil/, "apple-pencil", "Apple Pencil"],
    [/magic\s*keyboard/, "magic-keyboard", "Magic Keyboard"],
    [/magic\s*mouse/, "magic-mouse", "Magic Mouse"],
    [/magic\s*trackpad/, "magic-trackpad", "Magic Trackpad"],
    [/airtag/, "airtag", "AirTag"],
    [/homepod/, "homepod", "HomePod"],
    [/apple\s*tv/, "apple-tv", "Apple TV"],
    [/magsafe/, "magsafe", "MagSafe accessoire"],
  ];
  for (const [re, key, label] of defs) {
    if (re.test(t)) {
      const g = /(?:pencil|mouse|keyboard)\s*(?:\(?\s*)?(?:(\d)(?:e|nd)?\s*gen\w*|gen(?:eratie)?\s*(\d)|usb-?\s*c)/.exec(t);
      const gen = g ? (g[1] ?? g[2] ?? (key === "apple-pencil" ? "usbc" : null)) : null;
      return { family: "accessory", modelKey: gen ? `accessory-${key}-${gen}` : `accessory-${key}`, modelLabel: gen ? `${label} (${gen})` : label, specificity: 0.6 };
    }
  }
  return null;
}

/* ------------------------------ specificaties ------------------------------ */

function capacityValues(t: string): Array<{ gb: number; idx: number; text: string; ramCtx: boolean; ssdCtx: boolean }> {
  const out: Array<{ gb: number; idx: number; text: string; ramCtx: boolean; ssdCtx: boolean }> = [];
  const re = /(?<![0-9.,])(\d{1,4})\s?(tb|gb|go|gig|g)(?![a-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let gb = Number(m[1]);
    if (m[2] === "tb") gb *= 1024;
    if (m[2] === "g" && !STORAGE_SET.has(gb) && !RAM_SET.has(gb)) continue;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const before = t.slice(Math.max(0, m.index - 14), m.index);
    out.push({
      gb,
      idx: m.index,
      text: m[0],
      ramCtx: /^\s*(?:ram|geheugen|unified|memory|werkgeheugen)/.test(after) || /(?:ram|geheugen|memory)\s*:?\s*$/.test(before),
      ssdCtx: /^\s*(?:ssd|opslag|storage|schijf|hdd|flash|intern)/.test(after) || /(?:ssd|opslag|storage|schijf|opslagcapaciteit)\s*:?\s*$/.test(before),
    });
  }
  return out;
}

function batteryOf(t: string): { value: number; evidence: string } | null {
  const notUnit = "(?!\\d)(?!\\s*(?:cycli|cycles|cycle|keer|x\\b|maanden|maand|uur|jaar|dagen|euro|eur))";
  const res: RegExp[] = [
    new RegExp(`\\b(?:batterij|battery|batt?|accu|bgz)(?:conditie|gezondheid|health|capaciteit|status|percentage)?[^0-9\\n]{0,16}?(\\d{2,3})\\s*%?${notUnit}`, "g"),
    new RegExp(`\\b(?:gezondheid|health|maximale\\s*capaciteit|max\\.?\\s*capaciteit)\\s*(?:van|is|op|:|=|-)?\\s*(\\d{2,3})\\s*%?${notUnit}`, "g"),
    new RegExp(`(?<![0-9])(\\d{2,3})\\s*%\\s*(?:batterij|battery|batt?|accu|health|gezondheid|bgz|conditie|capaciteit)`, "g"),
  ];
  for (const re of res) {
    for (const m of t.matchAll(re)) {
      const v = Number(m[1]);
      if (v >= 40 && v <= 100) return { value: v, evidence: m[0] };
    }
  }
  return null;
}

function colorOf(t: string): { value: string; evidence: string } | null {
  for (const [re, name] of COLORS) {
    const m = re.exec(t);
    if (m) return { value: name, evidence: m[0] };
  }
  return null;
}

function cyclesOf(t: string): { value: number; evidence: string } | null {
  const m = /(?<![0-9])(\d{1,4})\s*(?:cycles?|cycli|laadcycli|oplaadcycli\w*)/.exec(t) ?? /(?:cycles?|cycli|laadcycli|cyclus)\s*(?:count|telling|aantal)?\s*[:=]?\s*(\d{1,4})/.exec(t);
  if (!m) return null;
  const v = Number(m[1]);
  return v <= 3000 ? { value: v, evidence: m[0] } : null;
}

function conditionOf(t: string): "A" | "B" | "C" | null {
  if (/als\s*nieuw|zo\s*goed\s*als\s*nieuw|nieuwstaat|nieuw\s*staat|perfecte\s*staat|like\s*new|\bmint\b|nieuw\s*in\s*(?:de\s*)?doos|sealed|geseald|ongeopend|zonder\s*(?:enige\s*)?(?:krassen|kras)|geen\s*(?:enkele\s*)?kras/.test(t)) return "A";
  if (/goede\s*staat|prima\s*staat|nette\s*staat|lichte\s*gebruikssporen|kleine\s*krasjes|goed\s*onderhouden|in\s*goede\s*conditie/.test(t)) return "B";
  if (/gebruikssporen|krassen|krasjes|deuk|beschadigd|slijtage|barst|gebarsten/.test(t)) return "C";
  return null;
}

/* --------------------------------- hoofdfunctie --------------------------------- */

export interface RecognitionInput {
  title: string;
  description?: string;
  /** Door de verkoper ingevulde advertentiekenmerken (bijv. 'battery health'); gelden als SELLER_CLAIM, nooit als vastgesteld. */
  structured?: Record<string, string | number> | null;
}

export function recognizeByRules(input: RecognitionInput): Recognition {
  const titleN = normalizeText(input.title);
  const full = normalizeText(`${input.title}. ${input.description ?? ""}`);

  // Model: titel heeft voorrang; valt terug op volledige tekst
  const detectors = [detectIphone, detectMac, detectIpad, detectWatch, detectAirpods, detectAccessory];
  let partial: Partial | null = null;
  for (const text of [titleN, full]) {
    for (const d of detectors) {
      const p = d(text);
      if (p) {
        partial = p;
        break;
      }
    }
    if (partial && partial.specificity >= 0.5) break;
  }
  if (!partial) partial = { family: "unknown", modelKey: "unknown", modelLabel: FAMILY_BASE_TITLE.unknown, specificity: 0 };

  const facts: Record<string, Fact> = {};
  const fam = partial.family;
  // Specificaties uit titel + beschrijving
  const specText = full;

  // Opslag / RAM
  const caps = capacityValues(specText);
  const isMac = ["macbook_air", "macbook_pro", "macbook", "mac_mini", "imac", "mac_studio"].includes(fam);
  if (isMac) {
    const ram = caps.find((c) => c.ramCtx) ?? null;
    const ssd = caps.find((c) => c.ssdCtx) ?? null;
    let ramV = ram?.gb ?? null;
    let ssdV = ssd?.gb ?? null;
    const rest = caps.filter((c) => c !== ram && c !== ssd);
    if (ramV == null && ssdV == null && rest.length >= 2) {
      const sorted = [...rest].sort((a, b) => a.gb - b.gb);
      if (RAM_SET.has(sorted[0].gb) && sorted[0].gb <= 192) {
        ramV = sorted[0].gb;
        ssdV = sorted[sorted.length - 1].gb;
        facts.ramGb = claim(ramV, `${sorted[0].text} (afgeleid: kleinste waarde = RAM)`);
        facts.storageGb = claim(ssdV, `${sorted[sorted.length - 1].text} (afgeleid: grootste waarde = SSD)`);
      }
    } else {
      for (const c of rest) {
        if (ramV == null && ssdV != null && RAM_SET.has(c.gb) && c.gb <= 192 && c.gb < ssdV) ramV = c.gb;
        else if (ssdV == null && ramV != null && c.gb >= 128) ssdV = c.gb;
        else if (ssdV == null && ramV == null && c.gb >= 256) ssdV = c.gb;
      }
      if (ram) facts.ramGb = claim(ram.gb, ram.text);
      else if (ramV != null) facts.ramGb = claim(ramV, `${ramV} GB`);
      if (ssd) facts.storageGb = claim(ssd.gb, ssd.text);
      else if (ssdV != null) facts.storageGb = claim(ssdV, `${ssdV} GB`);
    }
    const sc = screenOf(specText);
    if (sc) facts.screenInch = claim(sc, `${sc} inch`);
    const yr = yearOf(specText);
    if (yr) facts.year = claim(yr, String(yr));
    const chip = chipOf(specText);
    if (chip) facts.chip = claim(chip.label, chip.label);
    else if (isIntel(specText)) facts.chip = claim("Intel", "intel");
    const cy = cyclesOf(specText);
    if (cy) facts.cycles = claim(cy.value, cy.evidence);
  } else if (["iphone", "ipad", "watch", "airpods"].includes(fam)) {
    const bat = batteryOf(specText);
    const st = caps.filter((c) => STORAGE_SET.has(c.gb) && (fam === "iphone" || fam === "ipad" || (fam === "watch" && c.gb >= 16)))[0];
    if (st && (fam === "iphone" || fam === "ipad" || fam === "watch")) facts.storageGb = claim(st.gb, st.text);
    else if (fam === "iphone" || fam === "ipad") {
      // los getal, bijv. "iphone 15pro 256 batterij 91"
      const stripped = bat ? specText.replace(bat.evidence, " ") : specText;
      const after = stripped.slice(Math.max(0, stripped.search(/iphone|ipad/)));
      const bare = /(?<![0-9.,%])(64|128|256|512|1024)(?![0-9]|\s*%)/.exec(after.replace(/\b(?:iphone|ipad)\s*\d{1,2}/, ""));
      if (bare) facts.storageGb = claim(Number(bare[1]), `${bare[1]} (los getal)`);
    }
    if (bat && (fam === "iphone" || fam === "ipad" || fam === "watch" || fam === "airpods")) facts.batteryHealth = claim(bat.value, bat.evidence);
    const cy = cyclesOf(specText);
    if (cy) facts.cycles = claim(cy.value, cy.evidence);
    if (fam === "watch") {
      const mm = /(?<![0-9])(38|40|41|42|44|45|46|49)\s*mm/.exec(specText);
      if (mm) facts.sizeMm = claim(Number(mm[1]), mm[0]);
    }
    if (fam === "ipad" || fam === "watch") {
      if (/cellular|\b4g\b|\b5g\b|\blte\b|\bsim\b/.test(specText)) facts.connectivity = claim("Cellular", "cellular/sim");
      else if (/wifi|wi-fi/.test(specText)) facts.connectivity = claim("WiFi", "wifi");
      else if (fam === "watch" && /\bgps\b/.test(specText)) facts.connectivity = claim("GPS", "gps");
    }
    if (fam === "ipad") {
      const chip = chipOf(specText);
      if (chip) facts.chip = claim(chip.label, chip.label);
    }
  }

  const color = colorOf(specText);
  if (color && fam !== "unknown") facts.color = claim(color.value, color.evidence);

  // Gestructureerde (door verkoper ingevulde) attributen => SELLER_CLAIM, en winnen van losse tekst
  if (input.structured) {
    for (const [k, v] of Object.entries(input.structured)) {
      const key = k.toLowerCase();
      const str = String(v);
      if (/storage|opslag|capacit/.test(key)) {
        const c = capacityValues(normalizeText(str))[0];
        if (c) facts.storageGb = { value: c.gb, source: "SELLER_CLAIM", evidence: `${k}: ${str}` };
      } else if (/colou?r|kleur/.test(key)) {
        const c = colorOf(normalizeText(str));
        facts.color = { value: c?.value ?? str, source: "SELLER_CLAIM", evidence: `${k}: ${str}` };
      } else if (/batter|accu/.test(key)) {
        const n = Number(str.replace(/[^0-9]/g, ""));
        if (n >= 40 && n <= 100) facts.batteryHealth = { value: n, source: "SELLER_CLAIM", evidence: `${k}: ${str}` };
      } else if (/\bram\b|geheugen|memory/.test(key)) {
        const c = capacityValues(normalizeText(str))[0];
        if (c) facts.ramGb = { value: c.gb, source: "SELLER_CLAIM", evidence: `${k}: ${str}` };
      }
    }
  }

  const signals = detectSignals(full);

  // status-feiten
  if (signals.some((s) => s.code === "ACTIVATION_LOCK")) facts.activationLock = claim("locked", signals.find((s) => s.code === "ACTIVATION_LOCK")!.evidence);
  else if (signals.some((s) => s.code === "ACTIVATION_CLEAR_CLAIM")) facts.activationLock = claim("clear", signals.find((s) => s.code === "ACTIVATION_CLEAR_CLAIM")!.evidence);
  if (signals.some((s) => s.code === "SIMLOCK")) facts.simlock = claim("locked", signals.find((s) => s.code === "SIMLOCK")!.evidence);
  else if (signals.some((s) => s.code === "SIMLOCK_CLEAR_CLAIM")) facts.simlock = claim("clear", signals.find((s) => s.code === "SIMLOCK_CLEAR_CLAIM")!.evidence);
  if (signals.some((s) => s.code === "MDM")) facts.mdm = claim("yes", signals.find((s) => s.code === "MDM")!.evidence);
  if (signals.some((s) => s.code === "REPAIRED")) facts.repaired = claim(true, signals.find((s) => s.code === "REPAIRED")!.evidence);
  const dmg = signals.filter((s) => ["SCREEN_DAMAGE", "BACK_DAMAGE", "CAMERA_DAMAGE", "WATER_DAMAGE", "SEVERE_DEFECT", "COSMETIC_DAMAGE"].includes(s.code));
  if (dmg.length) facts.damage = claim(dmg.map((d) => d.code).join(","), dmg[0].evidence);

  let grade = conditionOf(full);
  if (signals.some((s) => ["SCREEN_DAMAGE", "BACK_DAMAGE", "CAMERA_DAMAGE", "COSMETIC_DAMAGE"].includes(s.code))) grade = "C";

  // Ontbrekende, relevante specificaties
  const unknown: string[] = [];
  const need: string[] =
    fam === "iphone" || fam === "ipad"
      ? ["storageGb", "batteryHealth", "activationLock"]
      : isMac
        ? ["ramGb", "storageGb", "chip", "cycles", "activationLock"]
        : fam === "watch"
          ? ["sizeMm", "batteryHealth"]
          : [];
  for (const k of need) if (!facts[k]) unknown.push(k);

  let confidence = 0;
  if (fam !== "unknown") confidence += 0.35;
  confidence += 0.4 * partial.specificity;
  if (facts.storageGb || ["airpods", "accessory"].includes(fam)) confidence += 0.1;
  if (facts.batteryHealth || facts.chip) confidence += 0.05;
  if (titleN.includes(partial.modelKey.split("-")[0])) confidence += 0.1;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    family: fam,
    modelKey: partial.modelKey,
    modelLabel: partial.modelLabel,
    confidence,
    recognizedBy: "rules",
    outOfScope: partial.outOfScope,
    facts,
    signals,
    conditionGrade: grade,
    unknown,
  };
}
