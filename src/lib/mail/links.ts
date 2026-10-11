export interface AdLink {
  url: string;
  externalId: string;
}

const VIP = /https?:\/\/(?:www\.)?marktplaats\.nl\/v\/[a-z0-9\-_/%]*?\/?((?:m|a)\d{6,})-[a-z0-9\-_%.]*/gi;

/** Haalt alle href's en kale URL's uit een mail (HTML + tekst). */
function allUrls(html: string, text: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) out.add(m[1].replace(/&amp;/g, "&"));
  for (const m of `${html}\n${text}`.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) out.add(m[0].replace(/&amp;/g, "&"));
  return [...out];
}

const decodeDeep = (u: string): string => {
  let cur = u;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return cur;
};

/**
 * Zoekt advertentielinks (marktplaats.nl/v/…/m123456789-titel) in een mail. Ook links die in een
 * tracking-/doorstuurlink zijn verpakt (URL-gecodeerd in een parameter) worden herkend.
 * Geeft nooit iets terug dat niet naar marktplaats.nl wijst.
 */
export function extractAdLinks(html: string, text = ""): AdLink[] {
  const seen = new Map<string, AdLink>();
  for (const raw of allUrls(html, text)) {
    const candidates = [raw, decodeDeep(raw)];
    for (const c of candidates) {
      for (const m of c.matchAll(VIP)) {
        const id = m[1].toLowerCase();
        if (seen.has(id)) continue;
        const url = m[0].replace(/[.,;:!?]+$/, "");
        seen.set(id, { url: url.replace(/^http:/, "https:").replace(/^https:\/\/marktplaats/, "https://www.marktplaats"), externalId: id });
      }
    }
  }
  return [...seen.values()];
}

/** Links van marktplaats.nl die géén advertentielink zijn (mogelijk doorstuurlinks), om eventueel op te lossen. */
export function otherMarktplaatsLinks(html: string, text = ""): string[] {
  return allUrls(html, text).filter((u) => {
    try {
      const h = new URL(u).hostname;
      return (h === "marktplaats.nl" || h.endsWith(".marktplaats.nl")) && !/\/v\//.test(decodeDeep(u)) && !/\.(png|jpe?g|gif|svg|css|js)(\?|$)/i.test(u);
    } catch {
      return false;
    }
  });
}
