import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { dealMessageForAd } from "@/lib/notify/dispatch";

/** Nieuwe pop-ups voor de geopende app: alles wat na `after` voor deze gebruiker is aangemaakt (maximaal 10, oudste eerst). */
export const GET = route(async (req, { user }) => {
  const u = new URL(req.url);
  const afterRaw = u.searchParams.get("after");
  const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : new Date();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, channel: "INAPP", createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: { ad: { select: { isDemo: true, images: { take: 1, orderBy: { position: "asc" }, select: { url: true } } } } },
  });
  const items = [];
  for (const n of rows) {
    const m = await dealMessageForAd(n.adId);
    if (!m) continue;
    items.push({
      id: n.id,
      adId: n.adId,
      createdAt: n.createdAt.toISOString(),
      model: m.modelLabel,
      storageGb: m.storageGb ?? null,
      askingCents: m.askingCents,
      expectedCents: m.expectedCents,
      netProfitCents: m.netProfitCents,
      score: m.score,
      distanceKm: m.distanceKm ?? null,
      provisional: m.definitive === false,
      reasons: m.provisionalReasons ?? [],
      externalUrl: n.ad.isDemo ? null : m.url,
      image: n.ad.images[0]?.url ?? null,
    });
  }
  return { items, now: (rows.length ? rows[rows.length - 1].createdAt : new Date()).toISOString() };
});
