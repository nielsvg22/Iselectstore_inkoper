/** Public HTML text-attribute route, verified live. No internal search API. */
export interface RecentCursor {
  at?: string;
  completeAt?: string;
  recentSinceMs?: number;
  nextPage?: number;
  headLast?: boolean;
}

/** Keep an overlapping window for delayed indexing; resume a partial window
 * rather than silently advancing past pages that could not fit the budget.
 */
export function recentSince(now: number, minutes: number, cursor?: RecentCursor): number {
  const oldest = now - 24 * 3600_000;
  if (cursor?.nextPage && cursor.nextPage > 1 && Number.isFinite(cursor.recentSinceMs)
    && cursor.recentSinceMs! >= oldest && cursor.recentSinceMs! <= now)
    return cursor.recentSinceMs!;
  const completed = Date.parse(cursor?.completeAt ?? cursor?.at ?? "");
  const desired = Math.min(now - minutes * 60_000, Number.isFinite(completed) ? completed - 90_000 : now);
  return Math.floor(Math.max(oldest, desired) / 1000) * 1000;
}

export function publicRecentUrl(base: string, sinceMs: number, page: number): string {
  if (!Number.isSafeInteger(sinceMs) || sinceMs <= 0 || !Number.isInteger(page) || page < 1)
    throw new Error("Ongeldig recent zoekvenster");
  const u = new URL(base);
  if (u.origin !== "https://www.marktplaats.nl" || u.username || u.password || u.search || u.hash
    || !/^\/(?:q\/|l\/)/.test(u.pathname)) throw new Error("Geen publieke Marktplaats-zoekpagina");
  u.pathname = `${u.pathname.replace(/\/p\/\d+\/$/, "/")}ta/offeredSince/${sinceMs}/${page > 1 ? `p/${page}/` : ""}`;
  return u.toString();
}
