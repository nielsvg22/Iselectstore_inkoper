import { prisma } from "../db/client";
import { APPLE_MODELS, CAT } from "../catalog/apple";
import type { Slice, SliceSpec } from "./facets";
import { modelByKey } from "../catalog/apple";

/**
 * Rondlopende planning van smalle resultaatlijsten ("slices"): elke controle pakt de slices die het langst niet
 * (of, relatief aan hun doelinterval, het meest te lang) zijn bekeken, tot een maximum aantal pagina's per controle.
 * Zo blijft de belasting begrensd, ook voor tientallen modellen — alleen de rondetijd wordt langer.
 */
export interface SliceRun {
  at: string;
  pages: number;
  total: number | null;
  covered?: number;
  complete?: boolean;
  completeAt?: string;
  recentSinceMs?: number;
  nextPage?: number;
  headLast?: boolean;
}
export type SliceState = Record<string, SliceRun>;

export async function getSliceState(profileId: string): Promise<SliceState> {
  const row = await prisma.appSettings.findUnique({ where: { key: `slice:state:${profileId}` } });
  return (row?.value as SliceState | undefined) ?? {};
}
export async function setSliceState(profileId: string, state: SliceState) {
  const key = `slice:state:${profileId}`;
  await prisma.appSettings.upsert({ where: { key }, create: { key, value: state as object }, update: { value: state as object } });
}

export const expectedPages = (run: SliceRun | undefined) => (run?.total != null ? Math.max(1, Math.ceil(run.total / 30)) : 4);

export interface Targets {
  highMs: number;
  normalMs: number;
}

/** Kiest welke slices nu aan de beurt zijn (hoogste "achterstand ten opzichte van het doel" eerst, binnen het paginabudget). */
export function selectSlices(slices: Slice[], state: SliceState, now: number, capPages: number, t: Targets): Slice[] {
  const scored = slices.map((s) => {
    const r = state[s.url];
    const target = s.priority === "high" ? t.highMs : t.normalMs;
    return { s, ratio: r ? (now - new Date(r.at).getTime()) / target : Number.POSITIVE_INFINITY, pages: expectedPages(r) };
  });
  const rank = (x: { ratio: number; s: Slice }) => x.ratio;
  scored.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) === Number.POSITIVE_INFINITY ? 1 : rank(a) === Number.POSITIVE_INFINITY ? -1 : rank(b) - rank(a);
    // gelijk (bijv. beide nooit bekeken): prioriteit eerst, daarna stabiele volgorde
    const pa = a.s.priority === "high" ? 0 : 1;
    const pb = b.s.priority === "high" ? 0 : 1;
    return pa - pb || (a.s.url < b.s.url ? -1 : 1);
  });
  const out: Slice[] = [];
  let used = 0;
  for (const x of scored) {
    if (out.length && used + x.pages > capPages) continue; // past niet meer: probeer een kleinere
    out.push(x.s);
    used += x.pages;
    if (used >= capPages) break;
  }
  return out;
}

export interface RoundEstimate {
  slices: number;
  pages: number;
  /** minuten voor één volledige ronde langs alle slices */
  fullRoundMin: number;
  /** minuten voor een ronde langs alleen de prioriteitsslices */
  highRoundMin: number | null;
}

/** Schatting van rondetijden: pagina's ÷ pagina's-per-controle × interval. */
export function estimateRounds(slices: Slice[], state: SliceState, capPages: number, intervalSec: number): RoundEstimate {
  const pagesOf = (list: Slice[]) => list.reduce((a, s) => a + expectedPages(state[s.url]), 0);
  const high = slices.filter((s) => s.priority === "high");
  const per = (pages: number) => Math.max(1, Math.ceil(pages / Math.max(1, capPages))) * (intervalSec / 60);
  return { slices: slices.length, pages: pagesOf(slices), fullRoundMin: per(pagesOf(slices)), highRoundMin: high.length ? per(pagesOf(high)) : null };
}

export const OPSLAGEN = [64, 128, 256, 512, 1024];

/** Modellen die standaard als "hoge prioriteit" gelden: iPhone 13 en nieuwer. */
export function defaultPriorityModels(): string[] {
  return APPLE_MODELS.filter((m) => m.category === CAT.iphone && /^iPhone (1[3-9]|Air)/.test(m.label)).map((m) => m.key);
}
export const allIphoneModels = (): string[] => APPLE_MODELS.filter((m) => m.category === CAT.iphone).map((m) => m.key);

/** Slice-specificaties uit de profielinstellingen (sliceModels) — los van de filters, zodat modellen zonder opslagkenmerk niet wegvallen. */
export function specsFromConfig(sc: { sliceModels?: string[]; sliceStorages?: number[]; priorityModels?: string[] }): SliceSpec[] {
  const out: SliceSpec[] = [];
  for (const k of sc.sliceModels ?? []) {
    const m = modelByKey(k);
    if (m && m.category) out.push({ model: { key: m.key, label: m.label, category: m.category }, storages: sc.sliceStorages ?? [], priority: sc.priorityModels?.includes(k) ? "high" : "normal" });
  }
  return out;
}
