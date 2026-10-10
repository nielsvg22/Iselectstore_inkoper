import { route } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { rateLimit } from "@/lib/security/ratelimit";
import { HttpError } from "@/lib/auth";
import { refreshAppleCategories } from "@/lib/sources/category-discovery";
import { SourceError } from "@/lib/sources/types";

export const maxDuration = 120;

/** Haalt de lijst met Apple-categorieën opnieuw op bij Marktplaats (beheerders). */
export const POST = route(
  async (_req, { user }) => {
    if (!rateLimit(`catalog-refresh:${user.id}`, 3, 10 * 60_000).ok) throw new HttpError(429, "Wacht even voordat je de lijst opnieuw ophaalt");
    try {
      const r = await refreshAppleCategories();
      await prisma.auditLog.create({ data: { userId: user.id, action: "catalog.refresh", meta: { categories: r.categories.length } } });
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: e instanceof SourceError ? e.message : (e as Error).message };
    }
  },
  { admin: true },
);
