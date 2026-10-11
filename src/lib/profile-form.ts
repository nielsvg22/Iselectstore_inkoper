import type { Group } from "./engines/filters";

export interface ProfileFormValue {
  id?: string;
  name: string;
  active: boolean;
  sourceKind: "SEARCH" | "MANUAL_URL" | "FEED" | "DEMO";
  queries: string[];
  category: string;
  maxPages: number;
  fetchDetails: boolean;
  fastMode: boolean;
  mailOnly: boolean;
  sliceSearch: boolean;
  /** Overige instellingen in sourceConfig die dit formulier niet toont (bijv. sliceModels, tier, group, baselineAt): blijven bij opslaan behouden */
  extraConfig?: Record<string, unknown>;
  urls: string;
  feedUrl: string;
  intervalMinutes: number;
  notifyEnabled: boolean;
  notifyMinScore: number;
  notifyChannels: string[];
  prioritizeNew: boolean;
  query: string;
  tree: Group;
}

export const defaultProfile = (): ProfileFormValue => ({ name: "", active: true, sourceKind: "SEARCH", queries: [], category: "", maxPages: 3, fetchDetails: true, fastMode: false, mailOnly: false, sliceSearch: true, urls: "", feedUrl: "", intervalMinutes: 60, notifyEnabled: true, notifyMinScore: 75, notifyChannels: ["TELEGRAM"], prioritizeNew: true, query: "", tree: { op: "AND", children: [] } });
