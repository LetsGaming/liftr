/** Rank list, backed by /api/ranks. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import { getRanks, type RankRow } from "../services/rankService";

export type { RankRow };

export const useRanksStore = defineStore("ranks", {
  state: () => ({
    ranks: [] as RankRow[],
    loaded: false,
    error: false,
  }),
  actions: {
    async load() {
      await withLoadState(getRanks, {
        apply: (ranks) => (this.ranks = ranks),
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
      });
    },

    /** Applies a sync-flush rank verdict to the in-memory list without a round trip — the
     *  in-session RankProgress bar needs to move the instant a set's verdict arrives, not after
     *  the next full /api/ranks reload. Falls back to a full load() the one time an exercise has
     *  no cached row yet (e.g. its first-ever ranked set this session). */
    applyVerdict(exerciseId: string, verdict: { tier: string; division: number; lp: number }) {
      const row = this.ranks.find((r) => r.exerciseId === exerciseId);
      if (row) {
        row.tier = verdict.tier;
        row.division = verdict.division;
        row.lp = verdict.lp;
      } else {
        void this.load();
      }
    },
  },
});
