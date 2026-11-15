import { APPLE_MODELS, CAT, modelByKey } from "../catalog/apple";
import { getRules } from "../rules/config";
import { getFilters } from "../rules/filters";
import { belowMinIphone } from "../rules/release";
import { defaultPriorityModels } from "../sources/slice-plan";

/** Wat het vaste zoekprofiel zoekt: alleen wat in de modellenlijst van de klant staat, iPhones vanaf de ingestelde generatie. */
export interface TwanScope {
  /** productgroepen (family) die gezocht worden */
  families: string[];
  /** zoektermen per productgroep, nieuwste eerst */
  queries: string[];
  /** iPhone-modellen waarvoor smalle zoekpagina's (slices) worden gebruikt */
  sliceModels: string[];
  priorityModels: string[];
  sliceStorages: number[];
  /** true = er staat een actieve modellenlijst; false = geen lijst (dan geldt alleen de generatiegrens op iPhones) */
  fromList: boolean;
}

const DEFAULT_STORAGES = [128, 256, 512];

/** Zoektermen per productgroep (zelfde termen voor Marktplaats en Vinted). */
export function queriesForFamilies(fams: ReadonlySet<string>, listed: boolean): string[] {
  const q: string[] = [];
  if (!listed || fams.has("iphone")) q.push("iphone");
  if (fams.has("ipad")) q.push("ipad");
  if (fams.has("macbook_air") || fams.has("macbook_pro") || fams.has("macbook")) q.push("macbook");
  if (fams.has("mac_mini") || fams.has("imac") || fams.has("mac_studio")) q.push("mac mini", "imac");
  if (fams.has("watch")) q.push("apple watch");
  if (fams.has("airpods")) q.push("airpods");
  return q.length ? q : ["iphone"];
}

export async function twanScope(): Promise<TwanScope> {
  const [rules, filters] = await Promise.all([getRules(), getFilters()]);
  const active = rules.filters.enabled ? filters.filter((f) => f.active) : [];
  const fromList = active.length > 0;
  const fams = new Set<string>(active.flatMap((f) => { const fam = modelByKey(f.modelKey)?.family; return fam ? [fam as string] : []; }));
  const listedModels = new Set(active.map((f) => f.modelKey));
  const sliceModels = APPLE_MODELS.filter(
    (m) => m.category === CAT.iphone && !belowMinIphone(m.key, "iphone", rules.minIphoneGeneration) && (!fromList || listedModels.has(m.key)),
  ).map((m) => m.key);
  const storages = [...new Set(active.filter((f) => f.storageGb != null && modelByKey(f.modelKey)?.family === "iphone").map((f) => f.storageGb as number))].sort((a, b) => a - b);
  return {
    families: fromList ? [...fams] : ["iphone"],
    queries: queriesForFamilies(fams, fromList),
    sliceModels,
    priorityModels: defaultPriorityModels().filter((k) => sliceModels.includes(k)),
    sliceStorages: storages.length ? storages : DEFAULT_STORAGES,
    fromList,
  };
}
