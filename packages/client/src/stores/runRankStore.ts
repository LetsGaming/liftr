/** Running/walking/hiking ranks/PRs/overall rank, backed by /api/runs/ranks (per activity type),
 *  /api/runs/prs (all activities together), and /api/runs/overall-rank (running only). Combines
 *  what would be three separate stores on the strength side (ranksStore/prStore/overallRankStore)
 *  into one, since all three describe the same "cardio rank" concept and are expected to be
 *  consumed together — but each section keeps its own loaded/error pair and load action, same as
 *  its strength-side counterpart, so one section failing never blocks the others. */
import { defineStore } from "pinia";
import { rankedCardioActivities } from "@liftr/shared";
import { withLoadState } from "../lib/loadState";
import {
  getRunOverallRank,
  getRunPrs,
  getRunRanks,
  type RunOverallRankBand,
  type RunPrListItem,
  type RunRankRow,
} from "../services/runRankService";

export type { RunOverallRankBand, RunPrListItem, RunRankRow } from "../services/runRankService";

/** Every activity that can produce a rank row (run/walk/hike today) — read from the shared
 *  registry rather than hardcoded here, so a future ranked activity needs no client change to
 *  start being fetched. */
async function loadAllRanks(): Promise<RunRankRow[]> {
  const rows = await Promise.all(rankedCardioActivities().map((a) => getRunRanks(a.id)));
  return rows.flat();
}

export const useRunRankStore = defineStore("runRank", {
  state: () => ({
    ranks: [] as RunRankRow[],
    prs: [] as RunPrListItem[],
    overallCurrent: null as RunOverallRankBand | null,
    overallPeak: null as RunOverallRankBand | null,
    ranksLoaded: false,
    prsLoaded: false,
    overallLoaded: false,
    ranksError: false,
    prsError: false,
    overallError: false,
  }),
  actions: {
    async loadRanks() {
      await withLoadState(loadAllRanks, {
        apply: (ranks) => (this.ranks = ranks),
        setLoaded: (v) => (this.ranksLoaded = v),
        setError: (v) => (this.ranksError = v),
      });
    },

    async loadPrs() {
      await withLoadState(getRunPrs, {
        apply: (prs) => (this.prs = prs),
        setLoaded: (v) => (this.prsLoaded = v),
        setError: (v) => (this.prsError = v),
      });
    },

    async loadOverallRank() {
      await withLoadState(getRunOverallRank, {
        apply: (result) => {
          this.overallCurrent = result.current;
          this.overallPeak = result.peak;
        },
        setLoaded: (v) => (this.overallLoaded = v),
        setError: (v) => (this.overallError = v),
      });
    },

    /** Convenience for callers that want all three sections at once (e.g. a run-rank overview
     *  page); each section still loads/fails independently. */
    async loadAll() {
      await Promise.all([this.loadRanks(), this.loadPrs(), this.loadOverallRank()]);
    },
  },
});
