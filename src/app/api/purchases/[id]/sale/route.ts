import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";

const schema = z.object({
  salePriceCents: z.number().int().min(0).max(10_000_000),
  soldAt: z.coerce.date(),
  extraCostCents: z.number().int().min(0).max(10_000_000).default(0),
  platform: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** Registreert een verkoop; dit wordt tevens een gerealiseerde marktprijs voor toekomstige waarderingen. */
export const POST = routeP<{ id: string }>(async (req, { params, user }) => {
  const body = await readJson(req, schema);
  const p = await prisma.purchase.findUnique({ where: { id: params.id }, include: { ad: { include: { product: { include: { specs: true } } } } } });
  if (!p || p.userId !== user.id) throw new HttpError(404, "Inkoop niet gevonden");
  const sale = await prisma.sale.upsert({ where: { purchaseId: p.id }, create: { purchaseId: p.id, ...body }, update: body });
  await prisma.purchase.update({ where: { id: p.id }, data: { status: "SOLD" } });
  const modelKey = p.modelKey ?? p.ad?.product?.modelKey;
  if (modelKey) {
    const bat = p.ad?.product?.specs.find((s) => s.key === "batteryHealth");
    await prisma.marketComparable.deleteMany({ where: { sourceUrl: `sale:${sale.id}` } });
    await prisma.marketComparable.create({
      data: { modelKey, storageGb: p.storageGb, priceCents: body.salePriceCents, kind: "REALIZED", batteryHealth: bat ? Number(bat.value) || null : null, source: "eigen-verkoop", sourceUrl: `sale:${sale.id}`, isDemo: p.ad?.isDemo ?? false, observedAt: body.soldAt },
    });
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "sale.register", entity: "Sale", entityId: sale.id } });
  return { id: sale.id };
});
