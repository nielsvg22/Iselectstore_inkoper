import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { getRules, saveRules } from "@/lib/rules/config";
import { clearRulesCache } from "@/lib/rules/apply";
import { prisma } from "@/lib/db/client";

const preset = z.enum(["rustig", "normaal", "druk"]);
const body = z.object({
  marktplaats: preset.optional(),
  vinted: preset.optional(),
  auto: z.boolean().optional(),
});

/** Margeknop: stand per platform (of automatisch) direct wijzigen. Werkt binnen ±15 seconden door in de worker. */
export const GET = route(async () => {
  const r = await getRules();
  return { presets: r.dynamic.presets, auto: r.dynamic.auto.enabled, offsetsEuro: r.dynamic.offsetsEuro };
});

export const POST = route(async (req, { user }) => {
  const b = await readJson(req, { parse: (v) => body.parse(v) });
  const r = await getRules();
  const next = { ...r, dynamic: { ...r.dynamic, auto: { ...r.dynamic.auto, enabled: b.auto ?? r.dynamic.auto.enabled }, presets: { marktplaats: b.marktplaats ?? r.dynamic.presets.marktplaats, vinted: b.vinted ?? r.dynamic.presets.vinted } } };
  const saved = await saveRules(next);
  clearRulesCache();
  await prisma.auditLog.create({ data: { userId: user.id, action: "rules.margin_knob", entity: "Rules", meta: { presets: saved.dynamic.presets, auto: saved.dynamic.auto.enabled } } });
  return { presets: saved.dynamic.presets, auto: saved.dynamic.auto.enabled, offsetsEuro: saved.dynamic.offsetsEuro };
}, { admin: true });
