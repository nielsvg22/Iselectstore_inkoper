import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { loadDemoData, removeDemoData } from "@/lib/pipeline/demo";

const schema = z.object({ action: z.enum(["load", "remove"]) });

export const POST = route(async (req, { user }) => {
  const { action } = await readJson(req, schema);
  const out = action === "load" ? await loadDemoData() : await removeDemoData();
  await prisma.auditLog.create({ data: { userId: user.id, action: `demo.${action}` } });
  return out;
});
