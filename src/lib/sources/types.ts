import type { DataOrigin } from "@prisma/client";

export interface RawAd {
  externalId: string;
  url: string;
  title: string;
  description?: string;
  askingCents?: number | null;
  location?: string | null;
  postalCode?: string | null;
  distanceKm?: number | null;
  category?: string | null;
  sellerType?: string | null;
  /** Alleen wat de bron zelf levert; ontbrekende gegevens blijven null (nooit aannemen) */
  seller?: { id?: string | null; name?: string | null; verified?: boolean | null; business?: boolean | null; anonymous?: boolean | null; rating?: number | null; reviewCount?: number | null; accountAgeMonths?: number | null };
  shipping?: string[];
  conditionText?: string | null;
  publishedAt?: Date | null;
  imageUrls: string[];
  attributes?: Record<string, string | number>;
  raw?: unknown;
  /** true = afkomstig van de volledige detailpagina (alle foto's + volledige tekst) */
  detailLoaded?: boolean;
}

export interface FetchContext {
  profileId: string;
  query: string;
  config: Record<string, unknown>;
  maxAds: number;
  /** Goedkope voorselectie (op basis van het profiel) zodat niet alles wordt opgeslagen/geanalyseerd */
  prefilter?: (ad: RawAd) => boolean;
  /** Detailpagina's niet binnen de zoekrun ophalen (gebeurt dan asynchroon via FETCH_DETAIL-jobs) */
  deferDetails?: boolean;
  /** Smalle resultaatlijsten (model × opslag via Marktplaats-filterpagina's); vervangt de zoektermen voor deze run */
  slices?: Array<{ url: string; label: string }>;
  /** Wordt aangeroepen zodra een smalle lijst of zoekterm is doorlopen (voor de rondlopende planning) */
  onUnit?: (key: string, info: { pages: number; total: number | null; covered: number }) => void;
  /** Zoektermen voor modellen zonder filterpagina; lopen naast de slices mee */
  extraQueries?: string[];
  /** Snelle modus: minder pagina's en een korte cache zodat de pagina vers is */
  fast?: { pages: number };
  /** Maximale leeftijd (sec) van een gecachte zoekpagina voor deze run */
  cacheSeconds?: number;
  /** Wordt door de bron ingevuld: aantal opgehaalde pagina's en cache-treffers */
  stats?: { pages: number; cacheHits: number; /** totaal aantal resultaten volgens de bron (som over zoektermen) */ total?: number; /** aantal resultaten dat we daadwerkelijk hebben gezien */ covered?: number };
  /** Alleen voor tests */
  fetchImpl?: typeof fetch;
  lookup?: (host: string) => Promise<string[]>;
}

export interface AdapterStatus {
  id: string;
  label: string;
  origin: DataOrigin;
  /** Minimale tijd tussen automatische controles, afhankelijk van bron/voorwaarden */
  minIntervalMinutes: number;
  automatic: boolean;
  description: string;
}

export interface SourceAdapter extends AdapterStatus {
  fetchProfile(ctx: FetchContext): Promise<RawAd[]>;
}

export class SourceError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
    this.name = "SourceError";
  }
}
