/**
 * Controleert of een advertentie-URL daadwerkelijk kan worden opgehaald en uitgelezen.
 * Gebruik:  npm run verify:source -- https://www.marktplaats.nl/v/.../m1234567890-...
 * Dit is de aanbevolen eerste stap in uw eigen omgeving: het bewijst (of weerlegt) dat de
 * URL-import voor uw netwerk en de actuele paginastructuur werkt. Er wordt niets opgeslagen.
 */
import "../src/worker/env";
import { fetchListingUrl } from "../src/lib/sources/adapters";
import { recognizeByRules } from "../src/lib/engines/recognition";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Gebruik: npm run verify:source -- <advertentie-url>");
    process.exit(2);
  }
  const t = Date.now();
  try {
    const ad = await fetchListingUrl(url, { allowlist: ["marktplaats.nl"], minSecondsBetween: 0 });
    const rec = recognizeByRules({ title: ad.title, description: ad.description, structured: ad.attributes });
    console.log(JSON.stringify({ ok: true, ms: Date.now() - t, externalId: ad.externalId, title: ad.title, priceEuro: ad.askingCents != null ? ad.askingCents / 100 : null, location: ad.location, images: ad.imageUrls.length, descriptionChars: ad.description?.length ?? 0, recognized: rec.modelLabel, confidence: rec.confidence }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, ms: Date.now() - t, error: (e as Error).message }, null, 2));
    process.exit(1);
  }
}
void main();
