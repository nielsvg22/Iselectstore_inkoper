/** Budget for one-page discovery units, with one request slot left for enrichment.
 * The shared request gate remains authoritative across workers and profiles.
 */
export function smartPageBudget(intervalSeconds: number, requestsPerMinute: number, minSecondsBetween: number, cap: number) {
  const gap = Math.max(3, minSecondsBetween, 60 / requestsPerMinute);
  return Math.max(1, Math.min(cap, 10, Math.floor(intervalSeconds / gap) - 1));
}

export interface DiscoveryUnit { key: string; query?: string; url?: string; label?: string }

/** Broad iPhone coverage first; all remaining families/slices share a fair oldest-first rotation.
 * Never use wall-clock modulo: slow rounds must not repeatedly skip the same families.
 */
export function planSmartUnits(
  queries: string[], slices: Array<{ url: string; label: string }>,
  state: Record<string, { at: string }>, budget: number,
): DiscoveryUnit[] {
  const unique = [...new Map(queries.map(q => [q.trim().toLowerCase(), q.trim()])).values()].filter(Boolean);
  const primary = unique.find(q => q.toLowerCase() === "iphone") ?? unique[0] ?? "iphone";
  const queryUnit = (query: string): DiscoveryUnit => ({ key: `q:${query}`, query });
  // Families precede model slices on equal age; known incomplete titles still get broad coverage.
  const families = unique.filter(q => q !== primary).map(queryUnit);
  const models: DiscoveryUnit[] = slices.map(s => ({ ...s, key: s.url }));
  const age = (u: DiscoveryUnit) => Date.parse(state[u.key]?.at ?? "") || 0;
  families.sort((a, b) => age(a) - age(b));
  models.sort((a, b) => age(a) - age(b));
  // At a one-page budget rotate every unit, instead of permanently starving other products.
  if (budget <= 1) {
    const all = [queryUnit(primary), ...families];
    all.sort((a, b) => age(a) - age(b));
    return all.slice(0, 1);
  }
  const latest = (units: DiscoveryUnit[]) => Math.max(0, ...units.map(age));
  const useModel = models.length > 0 && (budget > 2 || !families.length || latest(families) > latest(models));
  return [queryUnit(primary), ...families.slice(0, budget - 1 - Number(useModel)),
    ...(useModel ? models.slice(0, 1) : [])];
}
