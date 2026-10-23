import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { defaultConfig } from "@/lib/config/schema";
import { analyzePhotos, getPhotoAnalysis, photoScratchVerdict } from "@/lib/ai/photos";
import type { AiProvider } from "@/lib/ai/provider";
import { ingestAd } from "@/lib/pipeline/ingest";
import { POST as photosPost } from "@/app/api/ads/[id]/photos/route";
import { ctx, makeUser, req, resetDb } from "../helpers";

const cfg = { ...defaultConfig, ai: { ...defaultConfig.ai, provider: "anthropic" as const, maxCallsPerDay: 50, maxCostEurPerDay: 5 } };
const reply = (o: unknown): AiProvider & { calls: number } => {
  const p = { id: "fake:1", calls: 0, async complete() { p.calls++; return { text: "Hier: " + JSON.stringify(o), inputTokens: 100, outputTokens: 50 }; } };
  return p;
};
const good = { images: [{ index: 0, labels: ["krasvrij", "bestaat_niet"] }], overall: { scratch: "free", confidence: 0.9, summary: "Schoon toestel" } };

async function makeAd() {
  const a = await ingestAd({
    externalId: "m9100001", url: "https://www.marktplaats.nl/v/x/m9100001-iphone", title: "iPhone 15 Pro 256GB", description: "Mooi toestel.", askingCents: 50000, location: "Apeldoorn", distanceKm: 10,
    imageUrls: ["https://img.example/a.jpg", "https://img.example/b.jpg"], shipping: ["pickup"], publishedAt: new Date(), seller: { id: "1", name: "P", verified: true, business: false, anonymous: false },
  }, { origin: "SEARCH", partial: false });
  return a.adId;
}

beforeEach(async () => { await resetDb(); });

describe("foto-analyse", () => {
  it("negeert onbekende labels, bewaart het resultaat en hergebruikt het bij dezelfde foto's", async () => {
    const adId = await makeAd();
    // onbekend label in AI-uitvoer maakt het hele antwoord ongeldig: geen vuil in de database
    const bad = await analyzePhotos(adId, cfg, reply(good));
    expect(bad.ok).toBe(false);
    const p = reply({ ...good, images: [{ index: 0, labels: ["krasvrij"] }] });
    const r = await analyzePhotos(adId, cfg, p);
    expect(r.ok && !r.cached).toBe(true);
    const again = await analyzePhotos(adId, cfg, p);
    expect(again.ok && again.cached).toBe(true);
    expect(p.calls).toBe(1);
    const forced = await analyzePhotos(adId, cfg, p, true);
    expect(forced.ok && !forced.cached).toBe(true);
    expect((await getPhotoAnalysis(adId))?.result.images[0].labels).toEqual(["krasvrij"]);
  });

  it("zonder provider of zonder foto's geen analyse", async () => {
    const adId = await makeAd();
    expect((await analyzePhotos(adId, cfg, null)).ok).toBe(false);
    await prisma.advertisementImage.deleteMany({ where: { adId } });
    expect((await analyzePhotos(adId, cfg, reply(good))).ok).toBe(false);
  });

  it("alleen zekere oordelen sturen de krasregel", async () => {
    const adId = await makeAd();
    await analyzePhotos(adId, cfg, reply({ images: [], overall: { scratch: "free", confidence: 0.5 } }));
    expect(photoScratchVerdict(await getPhotoAnalysis(adId))).toBeNull();
    await analyzePhotos(adId, cfg, reply({ images: [], overall: { scratch: "heavy", confidence: 0.85 } }), true);
    expect(photoScratchVerdict(await getPhotoAnalysis(adId))).toBe("scratched");
    await analyzePhotos(adId, cfg, reply({ images: [], overall: { scratch: "free", stockPhoto: true, confidence: 0.9 } }), true);
    expect(photoScratchVerdict(await getPhotoAnalysis(adId))).toBeNull();
  });

  it("API: alleen ingelogd en 422 zonder AI-provider", async () => {
    const adId = await makeAd();
    expect((await photosPost(req(`/api/ads/${adId}/photos`, { method: "POST" }), ctx({ id: adId }))).status).toBe(401);
    const u = await makeUser();
    expect((await photosPost(req(`/api/ads/${adId}/photos`, { method: "POST", cookie: u.cookie }), ctx({ id: adId }))).status).toBe(422);
  });
});
