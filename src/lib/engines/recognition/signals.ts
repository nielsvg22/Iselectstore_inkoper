import type { Signal, SignalCode } from "@/lib/types";

/** Detecteert risico-/conditiesignalen in genormaliseerde tekst. Negatie-bewust. */

const NEGATORS = /\b(geen|zonder|niet|nooit|no|without|vrij van|niks|nergens)\b[^.,;!?]{0,22}$/;

function negatedBefore(text: string, idx: number): boolean {
  const window = text.slice(Math.max(0, idx - 30), idx);
  return NEGATORS.test(window);
}

interface Hit {
  idx: number;
  end: number;
  text: string;
}

function allMatches(text: string, re: RegExp): Hit[] {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const g = new RegExp(re.source, flags);
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    hits.push({ idx: m.index, end: m.index + m[0].length, text: m[0] });
    if (m[0].length === 0) g.lastIndex++;
  }
  return hits;
}

const mask = (text: string, hits: Hit[]) => {
  let out = text;
  for (const h of hits) out = out.slice(0, h.idx) + " ".repeat(h.end - h.idx) + out.slice(h.end);
  return out;
};

const R = {
  activationClear:
    /icloud\s*(vrij|free|unlocked|ontgrendeld|uitgelogd|verwijderd|gewist|schoon|is\s*vrij|is\s*uit)|(geen|zonder)\s*(icloud|activatie\s*slot|activatieslot|activation\s*lock|apple\s*id)(\s*(lock|slot|vergrendeling|account|gekoppeld))?|(icloud|activation\s*lock|activatieslot)\s*(is\s*)?(uit|off)|apple\s*id\s*(verwijderd|uitgelogd|gewist)/,
  activationLocked:
    /(icloud|activatie\s*slot|activatieslot|activation\s*lock|apple\s*id)\s*(lock|locked|vergrendeld|vergrendeling|slot|gekoppeld|actief|account|aan\b)|(gekoppeld|vergrendeld|locked)\s*(aan|met|op)?\s*(een\s*)?(icloud|apple\s*id)|find\s*my\s*(iphone|mac)?\s*(aan|actief|on)\b/,
  icloudMention: /\bicloud\b|activatie\s*slot|activatieslot|activation\s*lock|zoek\s*mijn|find\s*my/,
  mdm: /\bmdm\b|mobile\s*device\s*management|remote\s*management|zakelijk(?:e)?\s*(?:beheer|vergrendeld|profiel)|school\s*(?:beheer|apparaat|profiel)|\bdep\s*(?:lock|vergrendeld)/,
  simlockClear: /sim\s*-?\s*lock\s*-?\s*vrij|simvrij|sim\s*vrij|zonder\s*sim\s*-?\s*lock|geen\s*sim\s*-?\s*lock|\bunlocked\b|ontgrendeld|provider\s*vrij/,
  simlock: /sim\s*-?\s*lock|netwerk\s*lock|provider\s*lock|gelockt|vergrendeld\s*op\s*(?:een\s*)?provider/,
  stolen: /gestolen|\bstolen\b|hehler|diefstal|politie\s*aangifte\s*van/,
  ownershipUnclear:
    /gevonden\s*(?:op|in|bij)|iphone\s*gevonden|niet\s*van\s*mij|eigenaar\s*onbekend|onbekende\s*herkomst|weet\s*niet\s*van\s*wie|van\s*iemand\s*anders|niet\s*mijn\s*(?:telefoon|toestel|laptop)/,
  noProof: /(?:geen|zonder)\s*(?:aankoop)?\s*(?:bon|factuur|bewijs|aankoopbewijs|kassabon)\b/,
  blockedImei: /blacklist|geblokkeerd(?:e)?\s*imei|imei\s*(?:is\s*)?geblokkeerd|zwarte\s*lijst|blocked\s*imei|imei\s*blocked|gemeld\s*als\s*(?:verloren|gestolen)/,
  parts: /voor\s*onderdelen|for\s*parts|alleen\s*onderdelen|spares?\s*(?:or|of)\s*repair|sloop(?:toestel)?\b|ter\s*sloop/,
  water: /waterschade|vochtschade|in\s*(?:het\s*)?water\s*gevallen|water\s*damage|liquid\s*damage|vloeistofschade|in\s*(?:de\s*)?(?:wc|toilet|regen)\s*gevallen/,
  screen:
    /(?:scherm|display|screen|glas|touchscreen)\s*(?:is\s*|heeft\s*)?(?:gebarsten|barst|kapot|defect|gebroken|cracked|broken|gescheurd|beschadigd|spider|met\s*barst)|gebarsten\s*(?:scherm|display|glas)|barsten?\s*in\s*(?:het\s*)?(?:scherm|glas|display)|cracked\s*screen|broken\s*screen|schermschade|kapot\s*scherm|scherm\s*schade|scherm\s*defect/,
  back: /(?:achterkant|achterglas|back\s*glass|achterzijde|rugzijde)\s*(?:is\s*)?(?:gebarsten|barst|kapot|cracked|broken|beschadigd)|gebarsten\s*(?:achterkant|achterglas)|barst(?:en)?\s*(?:in|op)\s*(?:de\s*)?achterkant/,
  camera: /camera\s*(?:lens\s*|glas\s*)?(?:is\s*)?(?:gebarsten|kapot|defect|cracked|broken|werkt\s*niet)|cameraglas\s*(?:gebarsten|kapot)|lens\s*(?:gebarsten|kapot)/,
  cosmetic: /krasjes|krassen|\bkras\b|deukje|\bdeuk\b|gebruikssporen|schaafplek|slijtage|butsje|kleine\s*schade|haarlijntjes|beschadigd\s*behuizing/,
  severe:
    /moederbord|logic\s*-?\s*board|doet\s*niets|geen\s*beeld|start\s*niet|gaat\s*niet\s*aan|werkt\s*niet|niet\s*werkend|\bkapot\b|\bdefect(?:e)?\b|\bdood\b|no\s*power|bricked|bootloop|bootlus|hangt\s*op\s*(?:het\s*)?appel|zwart\s*beeld|reageert\s*niet|face\s*-?\s*id\s*(?:werkt\s*niet|defect|kapot)|touch\s*-?\s*id\s*(?:werkt\s*niet|defect|kapot)/,
  nonOriginal: /niet\s*origineel(?:e)?|aftermarket|replica|non-?\s*genuine|onbekend(?:e)?\s*onderdeel|unknown\s*part|onderdeel\s*melding|onderdelenmelding|nep\b|namaak/,
  repaired:
    /gerepareerd|(?:vervangen|nieuw(?:e)?|gewisseld)\s*(?:scherm|display|achterkant|achterglas|camera|glas)|(?:scherm|display|achterkant|camera)\s*(?:is\s*)?(?:vervangen|gerepareerd|gewisseld)|reparatie\s*(?:gehad|uitgevoerd)|repaired|eerder\s*(?:gerepareerd|open\s*geweest)/,
  batteryService: /(?:nieuwe|vervangen|gewisselde)\s*(?:batterij|accu|battery)|(?:batterij|accu|battery)\s*(?:is\s*)?(?:vervangen|nieuw|gewisseld)|batterij\s*service|service\s*batterij/,
  prepay:
    /betaal\s*(?:eerst|vooraf)|vooruit\s*betal|vooraf\s*betal|western\s*union|tikkie\s*eerst|stuur\s*eerst|pay\s*first|alleen\s*(?:via\s*)?(?:pakket|verzend)|ik\s*(?:ben|zit)\s*in\s*het\s*buitenland|paypal\s*vrienden|vrienden\s*en\s*familie|bitcoin|crypto|betaal\s*via\s*(?:de\s*)?link|betaallink/,
  injection:
    /(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules)|system\s*prompt|negeer\s+(?:alle\s+)?(?:vorige|eerdere|bovenstaande)\s+(?:instructies|opdrachten)|you\s+are\s+now|jij\s+bent\s+nu|nieuwe\s+instructies|geef\s+(?:deze\s+)?(?:advertentie\s+)?(?:een\s+)?score\s*\d+|assistant\s*:|<\/?\s*system\s*>|set\s+(?:the\s+)?score/,
};

export function detectSignals(text: string): Signal[] {
  const t = text;
  const out: Signal[] = [];
  const push = (code: SignalCode, evidence: string) => {
    if (!out.some((s) => s.code === code)) out.push({ code, evidence: evidence.trim().slice(0, 120) });
  };

  // iCloud / Activation Lock
  const clear = allMatches(t, R.activationClear);
  if (clear.length) push("ACTIVATION_CLEAR_CLAIM", clear[0].text);
  const locked = allMatches(mask(t, clear), R.activationLocked).filter((h) => !negatedBefore(t, h.idx));
  if (locked.length) push("ACTIVATION_LOCK", locked[0].text);
  else if (!clear.length) {
    const m = allMatches(t, R.icloudMention).filter((h) => !negatedBefore(t, h.idx));
    if (m.length) push("ACTIVATION_MENTIONED_UNCLEAR", m[0].text);
  }

  const mdm = allMatches(t, R.mdm).filter((h) => !negatedBefore(t, h.idx));
  if (mdm.length) push("MDM", mdm[0].text);

  const simClear = allMatches(t, R.simlockClear);
  if (simClear.length) push("SIMLOCK_CLEAR_CLAIM", simClear[0].text);
  const sim = allMatches(mask(t, simClear), R.simlock).filter((h) => !negatedBefore(t, h.idx));
  if (sim.length) push("SIMLOCK", sim[0].text);

  const stolen = allMatches(t, R.stolen).filter((h) => !negatedBefore(t, h.idx));
  if (stolen.length) push("STOLEN_MENTION", stolen[0].text);
  const own = allMatches(t, R.ownershipUnclear).filter((h) => !negatedBefore(t, h.idx));
  if (own.length) push("OWNERSHIP_UNCLEAR", own[0].text);
  const proof = allMatches(t, R.noProof);
  if (proof.length) push("NO_PURCHASE_PROOF", proof[0].text);
  const imei = allMatches(t, R.blockedImei).filter((h) => !negatedBefore(t, h.idx));
  if (imei.length) push("BLOCKED_IMEI", imei[0].text);

  const parts = allMatches(t, R.parts).filter((h) => !negatedBefore(t, h.idx));
  if (parts.length) push("FOR_PARTS", parts[0].text);
  const water = allMatches(t, R.water).filter((h) => !negatedBefore(t, h.idx));
  if (water.length) push("WATER_DAMAGE", water[0].text);

  // Specifieke schade eerst; maskeer zodat generieke "defect/kapot" niet dubbel telt
  const screen = allMatches(t, R.screen).filter((h) => !negatedBefore(t, h.idx));
  const back = allMatches(t, R.back).filter((h) => !negatedBefore(t, h.idx));
  const cam = allMatches(t, R.camera).filter((h) => !negatedBefore(t, h.idx));
  if (screen.length) push("SCREEN_DAMAGE", screen[0].text);
  if (back.length) push("BACK_DAMAGE", back[0].text);
  if (cam.length) push("CAMERA_DAMAGE", cam[0].text);
  const rest = mask(t, [...screen, ...back, ...cam]);
  const cosm = allMatches(rest, R.cosmetic).filter((h) => !negatedBefore(rest, h.idx));
  if (cosm.length) push("COSMETIC_DAMAGE", cosm[0].text);
  const severe = allMatches(rest, R.severe).filter((h) => !negatedBefore(rest, h.idx));
  if (severe.length) push("SEVERE_DEFECT", severe[0].text);

  const non = allMatches(t, R.nonOriginal).filter((h) => !negatedBefore(t, h.idx) || /niet\s*origineel/.test(h.text));
  if (non.length) push("NON_ORIGINAL_PARTS", non[0].text);
  const rep = allMatches(t, R.repaired).filter((h) => !negatedBefore(t, h.idx));
  if (rep.length) push("REPAIRED", rep[0].text);
  const bs = allMatches(t, R.batteryService).filter((h) => !negatedBefore(t, h.idx));
  if (bs.length) push("BATTERY_SERVICE", bs[0].text);

  const pre = allMatches(t, R.prepay).filter((h) => !negatedBefore(t, h.idx));
  if (pre.length) push("PREPAYMENT_REQUEST", pre[0].text);
  const inj = allMatches(t, R.injection);
  if (inj.length) push("PROMPT_INJECTION", inj[0].text);

  return out;
}
