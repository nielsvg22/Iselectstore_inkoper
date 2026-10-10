import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";

const schema = z.object({
  status: z.enum(["INTERESTING", "CONTACTED", "NEGOTIATING", "BOUGHT", "LISTED", "SOLD", "REJECTED"]).default("BOUGHT"),
  buyPriceCents: z.number().int().min(0).max(10_000_000).optional(),
});

/** Maakt (of werkt bij) het inkoop-record voor een advertentie. */
export const POST = routeP<{ id: string }>(async (req, { params, user }) => {
  const body = await readJson(req, schema);
  const ad = await prisma.advertisement.findUnique({ where: { id: params.id }, include: { product: { include: { specs: true } } } });
  if (!ad) throw new HttpError(404, "Advertentie niet gevonden");
  const storage = ad.product?.specs.find((s) => s.key === "storageGb");
  const base = {
    title: ad.title.slice(0, 200),
    modelKey: ad.product?.modelKey ?? null,
    storageGb: storage ? Number(storage.value) || null : null,
    askingCents: ad.askingPriceCents,
    status: body.status,
    ...(body.buyPriceCents != null ? { buyPriceCents: body.buyPriceCents } : {}),
    ...(body.status === "BOUGHT" ? { boughtAt: new Date(), buyPriceCents: body.buyPriceCents ?? ad.askingPriceCents ?? undefined } : {}),
  };
  const p = await prisma.purchase.upsert({
    where: { adId: ad.id },
    create: { ...base, userId: user.id, adId: ad.id },
    update: base,
  });
  if (body.status === "BOUGHT") await prisma.advertisement.update({ where: { id: ad.id }, data: { userState: "INTERESTING" } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "purchase.upsert", entity: "Purchase", entityId: p.id, meta: { status: body.status } } });
  return { id: p.id };
});
