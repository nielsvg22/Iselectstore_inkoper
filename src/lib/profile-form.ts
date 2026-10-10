import type { Group } from "./engines/filters";

export interface ProfileFormValue {
  id?: string;
  name: string;
  active: boolean;
  sourceKind: "MANUAL_URL" | "FEED" | "DEMO";
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

export const defaultProfile = (): ProfileFormValue => ({ name: "", active: true, sourceKind: "MANUAL_URL", urls: "", feedUrl: "", intervalMinutes: 60, notifyEnabled: true, notifyMinScore: 75, notifyChannels: ["TELEGRAM"], prioritizeNew: true, query: "", tree: { op: "AND", children: [] } });
