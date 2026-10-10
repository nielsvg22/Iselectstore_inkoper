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
  shipping?: string[];
  conditionText?: string | null;
  publishedAt?: Date | null;
  imageUrls: string[];
  attributes?: Record<string, string | number>;
  raw?: unknown;
}

export interface FetchContext {
  profileId: string;
  query: string;
  config: Record<string, unknown>;
  maxAds: number;
  /** Goedkope voorselectie (op basis van het profiel) zodat niet alles wordt opgeslagen/geanalyseerd */
  prefilter?: (ad: RawAd) => boolean;
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
