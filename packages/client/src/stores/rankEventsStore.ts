/** Rank-ups by weekday, backed by /api/rank-events. Feeds the Ränge page's "Rangaufstiege"
 *  calendar strip. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import { getRankEvents, type RankEventsByWeekday } from "../services/rankEventsService";

export const useRankEventsStore = defineStore("rankEvents", {
  state: () => ({
    byWeekday: [] as RankEventsByWeekday[],
    loaded: false,
  }),
  actions: {
    async load() {
      // offline with nothing cached yet — the strip just doesn't render
      await withLoadState(getRankEvents, {
        apply: (byWeekday) => (this.byWeekday = byWeekday),
        setLoaded: (v) => (this.loaded = v),
      });
    },
  },
});
