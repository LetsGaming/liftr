import { api } from "../lib/api";

export interface RankEventsByWeekday {
  /** JS `Date.getDay()`-indexed: 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  count: number;
  /** Count of this weekday's rank-ups whose originating workout was flagged by the
   *  plausibility gate (workstream B task 1) — see RankUpCalendar.vue for how this mutes a
   *  day's dot. */
  flaggedCount: number;
}

export function getRankEvents(): Promise<RankEventsByWeekday[]> {
  return api.get<RankEventsByWeekday[]>("/api/rank-events");
}
