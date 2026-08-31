/** Overall Lifter Rank (rank engine redesign R3), backed by /api/overall-rank. */
import { defineStore } from "pinia";
import { getOverallRank, type OverallRankBand } from "../services/overallRankService";

export const useOverallRankStore = defineStore("overallRank", {
  state: () => ({
    current: null as OverallRankBand | null,
    peak: null as OverallRankBand | null,
    loaded: false,
  }),
  actions: {
    async load() {
      try {
        const result = await getOverallRank();
        this.current = result.current;
        this.peak = result.peak;
        this.loaded = true;
      } catch {
        // offline with nothing cached yet — dashboard tile falls back to its own "—" state
      }
    },
  },
});
