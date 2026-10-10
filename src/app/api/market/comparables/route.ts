import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/settings/store";

export const GET = route(async (req) => {
  const modelKey = new URL(req.url).searchParams.get("modelKey") ?? undefined;
  const cfg = await getConfig();
  const items = await prisma.marketComparable.findMany({ where: { isDemo: cfg.demoMode, ...(modelKey ? { modelKey } : {}) }, orderBy: { observedAt: "desc" }, take: 200 });
  return { items };
});

const schema = z.object({
  modelKey: z.string().regex(/^[a-z0-9]+(-[a-z0-9_]+)*$/, "Gebruik bijv. iphone-15-pro").max(60),
  storageGb: z.number().int().min(0).max(8192).nullable().optional(),
  ramGb: z.number().int().min(0).max(512).nullable().optional(),
  priceCents: z.number().int().min(100).max(10_000_000),
  kind: z.enum(["REALIZED", "ASKING_CURRENT", "ASKING_HISTORIC"]).default("REALIZED"),
  batteryHealth: z.number().int().min(40).max(100).nullable().optional(),
  observedAt: z.coerce.date().optional(),
  note: z.string().max(200).optional(),
});

/** Handmatig vergelijkingsprijs / gerealiseerde verkoopprijs toevoegen (bijv. uit eigen administratie). */
export const POST = route(async (req, { user }) => {
  const b = await readJson(req, z.union([schema, z.object({ items: z.array(schema).min(1).max(500) })]));
  const cfg = await getConfig();
  const items = "items" in b ? b.items : [b];
  await prisma.marketComparable.createMany({
    data: items.map((i) => ({ modelKey: i.modelKey, storageGb: i.storageGb || null, ramGb: i.ramGb || null, priceCents: i.priceCents, kind: i.kind, batteryHealth: i.batteryHealth ?? null, source: "handmatig", sourceUrl: i.note ?? null, isDemo: cfg.demoMode, observedAt: i.observedAt ?? new Date() })),
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "market.add", meta: { count: items.length } } });
  return { added: items.length };
});
