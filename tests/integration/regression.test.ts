import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { getAdDetail } from "@/lib/queries";
import { analyzeAd } from "@/lib/pipeline/analyze";
import { ingestAd } from "@/lib/pipeline/ingest";
import { resetDb } from "../helpers";

beforeEach(resetDb);

it("detailpagina toont handmatige/geïmporteerde vergelijkingsprijzen (zonder sourceAdId) naast eigen advertentie", async () => {
  await prisma.marketComparable.createMany({ data: [700, 710, 690].map((p) => ({ modelKey: "iphone-14-pro", storageGb: 256, priceCents: p * 100, kind: "REALIZED" as const })) });
  const { adId } = await ingestAd({ externalId: "m9", url: "https://www.marktplaats.nl/v/x/m9", title: "iPhone 14 Pro 256GB", description: "Mooi toestel, icloud vrij. Ophalen.", askingCents: 50000, imageUrls: ["https://i.example/1.jpg"] }, { origin: "MANUAL_URL" });
  await analyzeAd(adId);
  const d = await getAdDetail(adId);
  expect(d!.comparables.length).toBe(3);
});
