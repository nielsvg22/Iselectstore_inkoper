/** Only explicit structured delivery information, never an AI inference. */
export function shippingFromDelivery(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const delivery = value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const out: string[] = [];
  if (/\bophalen\b/.test(delivery) && !/\b(?:niet|geen)\s+ophalen\b/.test(delivery)) out.push("pickup");
  // Recognised affirmative structured values only. Ambiguous/negative prose stays unknown.
  if (/^(?:(?:alleen )?(?:verzenden|verzending)(?: mogelijk)?|ophalen (?:(?:of|en) )?(?:verzenden|verzending)|(?:verzenden|verzending) (?:(?:of|en) )?ophalen)$/.test(delivery)) out.push("shipping");
  return out;
}
