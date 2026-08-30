/** Rank-ups by weekday (engagement rework W8), backed by /api/rank-events. Feeds the Ränge
 *  page's "Rangaufstiege" calendar strip. */
import { defineStore } from "pinia";
import { getRankEvents, type RankEventsByWeekday } from "../services/rankEventsService";

export const useRankEventsStore = defineStore("rankEvents", {
  state: () => ({
    byWeekday: [] as RankEventsByWeekday[],
    loaded: false,
  }),
  actions: {
    async load() {
      try {
        this.byWeekday = await getRankEvents();
        this.loaded = true;
      } catch {
        // offline with nothing cached yet — the strip just doesn't render
      }
    },
  },
});
