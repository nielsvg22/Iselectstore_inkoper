import { z } from "zod";
import { groupSchema } from "./engines/filters";

const httpsUrl = z.string().url().max(500).refine((u) => u.startsWith("https://"), "Alleen https-URL's zijn toegestaan");

const profileBase = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100),
  active: z.boolean().default(true),
  query: z.string().max(200).default(""),
  sourceKind: z.enum(["SEARCH", "MANUAL_URL", "FEED", "DEMO", "PARTNER_API", "IMPORT"]).default("MANUAL_URL"),
  sourceConfig: z
    .object({
      queries: z.array(z.string().trim().min(2).max(80)).max(10).optional(),
      category: z.string().regex(/^([a-z0-9-]+(\/[a-z0-9-]+)?)?$/, "Ongeldig categoriepad").optional(),
      maxPages: z.number().int().min(1).max(10).optional(),
      fetchDetails: z.boolean().optional(),
      /** Snelle modus (elke ±minuut kijken, direct voorlopige push) — vereist de globale schakelaar in Instellingen */
      fastMode: z.boolean().optional(),
      /** Alleen filteren en melden voor advertenties die via de gekoppelde mailbox binnenkomen; niet zelf zoeken */
      mailOnly: z.boolean().optional(),
      /** Snelle modus: smalle filterpagina's per model/opslag (standaard aan) */
      sliceSearch: z.boolean().optional(),
      /** Automatisch aangemaakte per-model-profielen: groep (categorie), model en prioriteit */
      group: z.string().max(60).optional(),
      auto: z.boolean().optional(),
      tier: z.enum(["high", "normal"]).optional(),
      /** Te volgen modellen (catalogus-sleutels), opslagformaten en prioriteitsmodellen — los van de filters */
      sliceModels: z.array(z.string().max(60)).max(60).optional(),
      sliceStorages: z.array(z.number().int()).max(10).optional(),
      priorityModels: z.array(z.string().max(60)).max(60).optional(),
      urls: z.array(httpsUrl).max(100).optional(),
      feedUrl: httpsUrl.optional(),
      allowedHosts: z.array(z.string().max(100)).max(10).optional(),
    })
    .passthrough()
    .default({}),
  intervalMinutes: z.number().int().min(5).max(1440).default(60),
  notifyEnabled: z.boolean().default(true),
  notifyChannels: z.array(z.enum(["TELEGRAM", "DISCORD"])).default(["TELEGRAM"]),
  notifyMinScore: z.number().int().min(0).max(100).default(75),
  prioritizeNew: z.boolean().default(true),
  tree: groupSchema.default({ op: "AND", children: [] }),
});
export const profileInput = profileBase.superRefine((p, ctx) => {
  if (p.sourceKind === "SEARCH" && !(p.sourceConfig.queries && p.sourceConfig.queries.length)) {
    ctx.addIssue({ code: "custom", path: ["sourceConfig", "queries"], message: "Voer minstens één zoekterm in" });
  }
});
export type ProfileInput = z.infer<typeof profileInput>;
