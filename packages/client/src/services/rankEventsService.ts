import { api } from "../lib/api";

export interface RankEventsByWeekday {
  /** JS `Date.getDay()`-indexed: 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  count: number;
}

export function getRankEvents(): Promise<RankEventsByWeekday[]> {
  return api.get<RankEventsByWeekday[]>("/api/rank-events");
}
