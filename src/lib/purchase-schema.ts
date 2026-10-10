import { z } from "zod";

const cents = z.number().int().min(0).max(10_000_000);
export const purchaseInput = z.object({
  title: z.string().trim().min(1).max(200),
  modelKey: z.string().max(60).nullable().optional(),
  storageGb: z.number().int().min(0).max(8192).nullable().optional(),
  status: z.enum(["INTERESTING", "CONTACTED", "NEGOTIATING", "BOUGHT", "LISTED", "SOLD", "REJECTED"]).default("BOUGHT"),
  askingCents: cents.nullable().optional(),
  buyPriceCents: cents.nullable().optional(),
  boughtAt: z.coerce.date().nullable().optional(),
  conditionNote: z.string().max(500).nullable().optional(),
  repairCostCents: cents.default(0),
  extraCostCents: cents.default(0),
  notes: z.string().max(5000).default(""),
});

