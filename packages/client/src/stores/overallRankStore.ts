/** Overall Lifter Rank (rank engine redesign R3), backed by /api/overall-rank. */
import { defineStore } from "pinia";
import { getOverallRank, type OverallRankBand } from "../services/overallRankService";

export const useOverallRankStore = defineStore("overallRank", {
  state: () => ({
    current: null as OverallRankBand | null,
    peak: null as OverallRankBand | null,
    loaded: false,
    error: false,
  }),
  actions: {
    async load() {
      try {
        const result = await getOverallRank();
        this.current = result.current;
        this.peak = result.peak;
        this.loaded = true;
        this.error = false;
      } catch {
        // See xpStore.ts's load() for why `error` exists (harden, P0: OverviewPage's
        // stalled-load banner needs to tell "still fetching" from "failed" apart).
        this.error = true;
      }
    },
  },
});
