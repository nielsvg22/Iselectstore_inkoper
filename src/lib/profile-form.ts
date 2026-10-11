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

export const defaultProfile = (): ProfileFormValue => ({ name: "", active: true, sourceKind: "SEARCH", queries: [], category: "", maxPages: 3, fetchDetails: true, fastMode: false, mailOnly: false, urls: "", feedUrl: "", intervalMinutes: 60, notifyEnabled: true, notifyMinScore: 75, notifyChannels: ["TELEGRAM"], prioritizeNew: true, query: "", tree: { op: "AND", children: [] } });
