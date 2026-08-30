import { api } from "../lib/api";

export interface HistoryItem {
  kind: "workout" | "run";
  id: string;
  at: string;
  title: string | null;
  meta: Record<string, unknown>;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export function getHistoryPage(cursor?: string | null): Promise<HistoryPage> {
  const query = cursor ? `?limit=20&cursor=${encodeURIComponent(cursor)}` : "?limit=20";
  return api.get<HistoryPage>(`/api/history${query}`);
}
