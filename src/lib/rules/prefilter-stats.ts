import { prisma } from "@/lib/db/client";

const key = (platform: string, day: string) => `prefilter:${platform}:${day}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Telt per platform en dag hoeveel advertenties al bij het ophalen zijn weggelaten (accessoires, koopadvertenties). */
export async function bumpPrefilterStats(platform: string, dropped: Record<string, number>): Promise<void> {
  const entries = Object.entries(dropped).filter(([, n]) => n > 0);
  if (!entries.length) return;
  const k = key(platform, today());
  const row = await prisma.appSettings.findUnique({ where: { key: k } });
  const cur = (row?.value ?? {}) as Record<string, number>;
  for (const [r, n] of entries) cur[r] = (cur[r] ?? 0) + n;
  await prisma.appSettings.upsert({ where: { key: k }, create: { key: k, value: cur }, update: { value: cur } });
}

export async function prefilterStats(platform: "marktplaats" | "vinted", days = 1): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const row = await prisma.appSettings.findUnique({ where: { key: key(platform, d) } });
    for (const [r, n] of Object.entries((row?.value ?? {}) as Record<string, number>)) out[r] = (out[r] ?? 0) + n;
  }
  return out;
}
