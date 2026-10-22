import { route, readJson } from "@/lib/api";
import { getRules, saveRules, rulesSchema } from "@/lib/rules/config";
import { clearRulesCache } from "@/lib/rules/apply";
import { prisma } from "@/lib/db/client";

export const GET = route(async () => ({ rules: await getRules() }));

/** Alleen beheerders mogen de inkoopregels wijzigen; de wijziging komt in het auditlogboek. */
export const PUT = route(async (req, { user }) => {
  const body = await readJson(req, { parse: (v) => rulesSchema.parse(v) });
  const rules = await saveRules(body);
  clearRulesCache();
  await prisma.auditLog.create({ data: { userId: user.id, action: "rules.config_changed", entity: "Rules" } });
  return { rules };
}, { admin: true });
