import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { purchaseInput } from "@/lib/purchase-schema";
import { purchaseStats } from "@/lib/queries";

export const GET = route(async (_req, { user }) => {
  const s = await purchaseStats(user.id);
  return { totalBuy: s.totalBuy, stockValue: s.stockValue, realized: s.realized, avgProfit: s.avgProfit, avgDays: s.avgDays, soldCount: s.soldCount, purchases: s.purchases };
});

export const POST = route(async (req, { user }) => {
  const body = await readJson(req, purchaseInput);
  const p = await prisma.purchase.create({ data: { ...body, userId: user.id } });
  return { id: p.id };
});
