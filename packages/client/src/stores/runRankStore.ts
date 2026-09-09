/** Running ranks/PRs/overall rank, backed by /api/runs/ranks, /api/runs/prs, and
 *  /api/runs/overall-rank. Combines what would be three separate stores on the strength side
 *  (ranksStore/prStore/overallRankStore) into one, since all three describe the same "run rank"
 *  concept and are expected to be consumed together — but each section keeps its own
 *  loaded/error pair and load action, same as its strength-side counterpart, so one section
 *  failing never blocks the others. */
import { defineStore } from "pinia";
import {
  getRunOverallRank,
  getRunPrs,
  getRunRanks,
  type RunOverallRankBand,
  type RunPrListItem,
  type RunRankRow,
} from "../services/runRankService";

export type { RunOverallRankBand, RunPrListItem, RunRankRow } from "../services/runRankService";

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
      try {
        this.ranks = await getRunRanks();
        this.ranksLoaded = true;
        this.ranksError = false;
      } catch {
        // See xpStore.ts's load() for why `error` exists — a stalled-load banner needs to tell
        // "still fetching" from "failed" apart.
        this.ranksError = true;
      }
    },

    async loadPrs() {
      try {
        this.prs = await getRunPrs();
        this.prsLoaded = true;
        this.prsError = false;
      } catch {
        this.prsError = true;
      }
    },

    async loadOverallRank() {
      try {
        const result = await getRunOverallRank();
        this.overallCurrent = result.current;
        this.overallPeak = result.peak;
        this.overallLoaded = true;
        this.overallError = false;
      } catch {
        this.overallError = true;
      }
    },

    /** Convenience for callers that want all three sections at once (e.g. a run-rank overview
     *  page); each section still loads/fails independently. */
    async loadAll() {
      await Promise.all([this.loadRanks(), this.loadPrs(), this.loadOverallRank()]);
    },
  },
});
