/** Tekstnormalisatie + typo-correctie voor merk- en productwoorden. */

const VOCAB = ["iphone", "macbook", "airpods", "ipad", "imac", "macmini", "macstudio"];

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const ALIASES: Array<[RegExp, string]> = [
  [/\bi\s*phone\b/g, "iphone"],
  [/\bmac\s*book\b/g, "macbook"],
  [/\bair\s*pods?\b/g, "airpods"],
  [/\bapple\s*watch\b/g, "applewatch"],
  [/\bmac\s*mini\b/g, "macmini"],
  [/\bmac\s*studio\b/g, "macstudio"],
  [/\bi\s*mac\b/g, "imac"],
  [/\bpromax\b/g, "pro max"],
  [/\bprime\b/g, "pro"],
];

function fixToken(tok: string): string {
  const m = /^([a-z]{4,10})(\d.*)?$/.exec(tok);
  if (!m) return tok;
  const word = m[1];
  const rest = m[2] ?? "";
  if (VOCAB.includes(word)) return tok;
  let best: string | null = null;
  let bestD = 99;
  for (const v of VOCAB) {
    const d = levenshtein(word, v);
    const limit = v.length >= 7 ? 2 : 1;
    if (d <= limit && d < bestD && Math.abs(word.length - v.length) <= 2) {
      best = v;
      bestD = d;
    }
  }
  if (!best) return tok;
  return rest ? `${best} ${rest}` : best;
}

/** Lowercase, zonder accenten, spaties genormaliseerd, typo's in merkwoorden hersteld. */
export function normalizeText(input: string): string {
  let t = stripDiacritics(input.toLowerCase());
  t = t.replace(/[‘’“”]/g, '"').replace(/[\r\n\t]+/g, " ");
  t = t
    .split(/\s+/)
    .map(fixToken)
    .join(" ");
  for (const [re, rep] of ALIASES) t = t.replace(re, rep);
  return t.replace(/\s+/g, " ").trim();
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
}
