/** Eenvoudige sliding-window limiter in het geheugen (per proces). */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

/** Controleert zonder te tellen (bijv. om alleen mislukte pogingen mee te laten tellen). */
export function peekRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

/** Registreert één poging voor een sleutel. */
export function recordHit(key: string, now = Date.now()) {
  const arr = buckets.get(key) ?? [];
  arr.push(now);
  buckets.set(key, arr);
}

export function resetRateLimits() {
  buckets.clear();
}

/** Beperkt een async-actie tot minimaal `gapMs` tussen starts (uitgaande bronrequests). */
export class Throttle {
  private last = 0;
  constructor(private gapMs: number) {}
  async wait() {
    const now = Date.now();
    const wait = Math.max(0, this.last + this.gapMs - now);
    this.last = now + wait;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }
}
