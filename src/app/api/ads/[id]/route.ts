import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { readJson, routeP } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { enqueue } from "@/lib/jobs/queue";
import { getAdDetail } from "@/lib/queries";

export const GET = routeP<{ id: string }>(async (_req, { params }) => {
  const d = await getAdDetail(params.id);
  if (!d) throw new HttpError(404, "Advertentie niet gevonden");
  return { ad: { ...d.ad, rawPayload: undefined }, current: d.current, risk: d.ad.risk, valuations: d.valuations, comparables: d.comparables };
});

const cents = z.number().int().min(0).max(100_000_00);
const patch = z.object({
  userState: z.enum(["NONE", "INTERESTING", "FAVORITE", "IGNORED"]).optional(),
  notes: z.string().max(5000).optional(),
  overrides: z
    .object({
      recognition: z
        .object({
          modelKey: z.string().regex(/^[a-z0-9]+(-[a-z0-9_]+)*$/).max(60).optional(),
          modelLabel: z.string().max(80).optional(),
          family: z.enum(["iphone", "macbook_air", "macbook_pro", "macbook", "ipad", "watch", "airpods", "mac_mini", "imac", "mac_studio", "accessory", "unknown"]).optional(),
          facts: z.record(z.string().max(30), z.union([z.string().max(60), z.number(), z.boolean()])).optional(),
        })
        .optional(),
      costs: z.object({ repairCents: cents.optional(), shippingCents: cents.optional(), transportCents: cents.optional(), otherCents: cents.optional(), marginSchemeEligible: z.boolean().optional() }).optional(),
    })
    .optional(),
  needsManualReview: z.boolean().optional(),
});

export const PATCH = routeP<{ id: string }>(async (req, { params, user }) => {
  const body = await readJson(req, patch);
  const ad = await prisma.advertisement.findUnique({ where: { id: params.id } });
  if (!ad) throw new HttpError(404, "Advertentie niet gevonden");
  await prisma.advertisement.update({
    where: { id: ad.id },
    data: {
      ...(body.userState ? { userState: body.userState } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.needsManualReview !== undefined ? { needsManualReview: body.needsManualReview } : {}),
      ...(body.overrides ? { overrides: { ...((ad.overrides ?? {}) as object), ...body.overrides } } : {}),
    },
  });
  if (body.userState === "FAVORITE") await prisma.watchlist.upsert({ where: { userId_adId: { userId: user.id, adId: ad.id } }, create: { userId: user.id, adId: ad.id }, update: {} });
  if (body.userState && body.userState !== "FAVORITE") await prisma.watchlist.deleteMany({ where: { userId: user.id, adId: ad.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ad.update", entity: "Advertisement", entityId: ad.id, meta: { fields: Object.keys(body) } } });
  if (body.overrides) await enqueue({ type: "ANALYZE_AD", payload: { adId: ad.id }, priority: 30, uniqueKey: `analyze:${ad.id}:override:${Date.now()}` });
  return { ok: true };
});
