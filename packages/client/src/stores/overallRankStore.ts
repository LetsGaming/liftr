/** Overall Lifter Rank, backed by /api/overall-rank. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
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
      await withLoadState(getOverallRank, {
        apply: (result) => {
          this.current = result.current;
          this.peak = result.peak;
        },
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
      });
    },
  },
});
