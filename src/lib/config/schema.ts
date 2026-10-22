import { z } from "zod";

/**
 * Applicatieconfiguratie (niet-geheim). Geheimen (API-sleutels, tokens) staan
 * versleuteld in AppSettings en komen nooit terug in frontendresponses.
 */
export const configSchema = z.object({
  demoMode: z.boolean().default(false),
  officialApi: z.object({
    enabled: z.boolean().default(false),
    /** Alleen na expliciete toestemming/scopes van Marktplaats; een GoedGeplaatst-key volstaat niet. */
    accessApproved: z.boolean().default(false),
    intervalSeconds: z.number().int().min(30).max(3600).default(60),
    requestsPerMinute: z.number().int().min(1).max(30).default(2),
    pageSize: z.number().int().min(1).max(200).default(100),
  }).default({}),
  radar: z
    .object({
      /** Temporary exact-city scope; empty restores the broader radar. */
      cityOnly: z.enum(["", "Apeldoorn"]).default(""),
      topMinProfitCents: z.number().int().min(0).default(7500),
      topMinScore: z.number().int().min(0).max(100).default(80),
    })
    .default({}),

  ai: z
    .object({
      provider: z
        .enum(["none", "anthropic", "openai", "openai_compatible"])
        .default("none"),
      model: z.string().max(100).default(""),
      baseUrl: z.string().max(300).default(""),
      analyzeImages: z.boolean().default(false),
      maxCallsPerDay: z.number().int().min(0).max(100000).default(200),
      maxCostEurPerDay: z.number().min(0).max(1000).default(2),
      inputPricePerMTokEur: z.number().min(0).default(3),
      outputPricePerMTokEur: z.number().min(0).default(15),
    })
    .default({}),

  telegram: z.object({ chatId: z.string().max(100).default("") }).default({}),

  targets: z
    .object({
      minProfitCents: z.number().int().min(0).default(10000),
      minRoiPct: z.number().min(0).default(25),
      minDealScore: z.number().int().min(0).max(100).default(60),
      maxBuyCents: z.number().int().min(0).default(100000),
      searchRadiusKm: z.number().min(0).default(40),
      defaultLocation: z.string().max(100).default("Apeldoorn"),
      riskTolerance: z.enum(["low", "medium", "high"]).default("medium"),
    })
    .default({}),

  costs: z
    .object({
      shippingCents: z.number().int().min(0).default(0),
      transportCents: z.number().int().min(0).default(0),
      otherCents: z.number().int().min(0).default(0),
      platformFeePct: z.number().min(0).max(50).default(0),
      transactionFeePct: z.number().min(0).max(50).default(0),
    })
    .default({}),

  tax: z
    .object({
      // none = geen btw-kosten meenemen; standard = btw over volledige verkoopprijs;
      // margin = margeregeling (alleen indien marginSchemeEligible = true)
      vatMode: z.enum(["none", "standard", "margin"]).default("none"),
      vatRatePct: z.number().min(0).max(30).default(21),
      marginSchemeEligible: z.boolean().default(false),
    })
    .default({}),

  repairCostsCents: z
    .object({
      screen: z.number().int().min(0).default(12000),
      back: z.number().int().min(0).default(10000),
      battery: z.number().int().min(0).default(6000),
      camera: z.number().int().min(0).default(8000),
      other: z.number().int().min(0).default(5000),
    })
    .default({}),

  valuation: z
    .object({
      // Aandeel van vraagprijs dat gemiddeld daadwerkelijk wordt gerealiseerd (aanname, instelbaar)
      askToRealizedFactor: z.number().min(0.5).max(1.1).default(0.92),
      minComparables: z.number().int().min(1).default(5),
      maxAgeDays: z.number().int().min(7).default(90),
      storageStepPct: z.number().min(0).max(50).default(10),
      repairedDiscountPct: z.number().min(0).max(40).default(5),
      batteryPenaltyPctPerPoint: z.number().min(0).max(5).default(0.5),
      batteryPenaltyBelow: z.number().int().min(50).max(100).default(85),
      conditionMultipliers: z
        .object({
          A: z.number().default(1),
          B: z.number().default(0.95),
          C: z.number().default(0.85),
          unknown: z.number().default(0.95),
        })
        .default({}),
    })
    .default({}),

  scoring: z
    .object({
      weights: z
        .object({
          roi: z.number().min(0).default(30),
          profit: z.number().min(0).default(25),
          certainty: z.number().min(0).default(15),
          condition: z.number().min(0).default(10),
          sellability: z.number().min(0).default(10),
          risk: z.number().min(0).default(10),
        })
        .default({}),
      bands: z
        .object({
          top: z.number().default(90),
          veryInteresting: z.number().default(75),
          interesting: z.number().default(60),
          moderate: z.number().default(40),
        })
        .default({}),
    })
    .default({}),

  notifications: z
    .object({
      enabled: z.boolean().default(true),
      minBand: z
        .enum(["TOP", "VERY_INTERESTING", "INTERESTING"])
        .default("VERY_INTERESTING"),
      channels: z.array(z.enum(["TELEGRAM", "DISCORD"])).default(["TELEGRAM"]),
      /** Geen (definitieve) melding zolang de volledige advertentie (detailpagina) nog niet is beoordeeld */
      requireFullAnalysis: z.boolean().default(true),
    })
    .default({}),

  policies: z
    .object({
      seller: z
        .object({
          minRating: z.number().min(0).max(5).default(4.6),
          minReviews: z.number().int().min(0).default(15),
          minAgeMonths: z.number().int().min(0).default(12),
        })
        .default({}),
      distance: z
        .object({
          mode: z.enum(["kilometers", "driving"]).default("kilometers"),
          pickupMaxMinutes: z.number().int().min(1).max(180).default(30),
          /** Tot hier is ophalen acceptabel (voorbeeld klant: ±45 km) */
          pickupMaxKm: z.number().min(0).max(1000).default(40),
          /** Reiskosten per kilometer (heen en terug); 0 = niet meenemen */
          transportPerKmCents: z.number().int().min(0).max(500).default(0),
          /** Verzendkosten bij ophalen op afstand niet nodig; 0 = niet automatisch meenemen */
          shippingCostCents: z.number().int().min(0).default(0),
        })
        .default({}),
      battery: z
        .object({
          /** Uitsluiten onder dit percentage (0 = uit) */
          excludeBelowPct: z.number().min(0).max(100).default(0),
          unknown: z.enum(["allow", "review", "exclude"]).default("allow"),
          /** Onder dit percentage geldt batterijvervanging als relevant */
          replaceBelowPct: z.number().min(0).max(100).default(85),
          replacementCents: z.number().int().min(0).default(9000),
          deductReplacement: z.boolean().default(false),
          /** Correctie op de verwachte verkoopprijs (%) onder de vervangingsgrens; 0 = geen */
          priceCorrectionPct: z.number().min(0).max(50).default(0),
        })
        .default({}),
    })
    .default({}),

  /** Mailbox-koppeling: leest Marktplaats-zoekalerts (opgeslagen zoekopdrachten) uit je eigen mailbox */
  mail: z
    .object({
      enabled: z.boolean().default(false),
      host: z.string().trim().max(200).default(""),
      port: z.number().int().min(1).max(65535).default(993),
      user: z.string().trim().max(200).default(""),
      folder: z.string().trim().max(200).default("INBOX"),
      /** Alleen berichten waarvan de afzender dit bevat worden verwerkt */
      fromContains: z.string().trim().max(100).default("marktplaats"),
      pollSeconds: z.number().int().min(10).max(300).default(20),
    })
    .default({}),

  scheduler: z
    .object({
      /** Kortste interval tussen controles van één zoekprofiel (harde ondergrens 5 min, geen realtime) */
      minIntervalMinutes: z.number().int().min(5).max(1440).default(10),
      /** Parallelle analyse-/meldingsjobs (netwerkverkeer naar Marktplaats blijft in één, gepaceerde rij) */
      concurrency: z.number().int().min(1).max(8).default(3),
      /** Gedeelde cache van zoekpagina's zodat profielen met dezelfde zoekterm niet dubbel ophalen */
      pageCacheSeconds: z.number().int().min(0).max(900).default(120),
      /** Snelle modus: per profiel elke ±minuut kijken, direct voorlopige push. Staat standaard UIT (bewuste keuze). */
      fast: z
        .object({
          enabled: z.boolean().default(false),
          intervalSeconds: z.number().int().min(30).max(600).default(60),
          /** Centrale radar: overlappend recent venster via publieke HTML; 0 = oude brede zoekroute. */
          recentWindowMinutes: z.number().int().min(0).max(60).default(5),
          /** Maximaal aantal pagina's per zoekterm; de controle stopt eerder zodra alle resultaten zijn gezien */
          pages: z.number().int().min(1).max(40).default(20),
          /** Bovengrens voor het totaal aantal pagina-requests per minuut over alle snelle profielen */
          maxRequestsPerMinute: z.number().int().min(1).max(30).default(6),
          /** Vangnet: zo vaak (min.) wordt in plaats van de smalle filterpagina's de volledige zoekterm doorlopen, voor advertenties zonder model-/opslagkenmerk */
          fullSearchEveryMinutes: z.number().int().min(1).max(240).default(10),
          /** Rondlopende planning: maximaal zoveel pagina's per controle (houdt de belasting begrensd bij veel modellen) */
          pagesPerRun: z.number().int().min(1).max(60).default(12),
          /** Doelinterval (min) voor prioriteitsmodellen en voor de overige modellen */
          priorityEveryMinutes: z.number().int().min(1).max(120).default(3),
          normalEveryMinutes: z.number().int().min(1).max(240).default(20),
        })
        .default({}),
    })
    .default({}),

  sources: z
    .object({
      allowed: z
        .array(
          z.enum([
            "MANUAL_URL",
            "IMPORT",
            "FEED",
            "PARTNER_API",
            "DEMO",
            "SEARCH",
          ]),
        )
        .default(["MANUAL_URL", "IMPORT", "FEED", "DEMO", "SEARCH"]),
      urlAllowlist: z.array(z.string().max(100)).default(["marktplaats.nl"]),
    })
    .default({}),

  limits: z
    .object({
      maxAdsPerRun: z.number().int().min(1).max(1000).default(120),
      maxDetailsPerRun: z.number().int().min(0).max(200).default(40),
      requestsPerDayPerSource: z.number().int().min(1).default(500),
      minSecondsBetweenRequests: z.number().min(0).default(3),
      jobsPerTick: z.number().int().min(1).max(200).default(25),
      adRetentionDays: z.number().int().min(7).default(180),
    })
    .default({}),
});

export type AppConfig = z.infer<typeof configSchema>;
export const defaultConfig: AppConfig = configSchema.parse({});

export const SECRET_KEYS = [
  "ai.apiKey",
  "telegram.botToken",
  "discord.webhookUrl",
  "imap.password",
  "marktplaats.accessToken",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
