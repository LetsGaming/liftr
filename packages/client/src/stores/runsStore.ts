/** Runs, backed by /api/runs. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import {
  deleteRun as deleteRunOnServer,
  getRunDetail,
  getRuns,
  importRunFile,
  logManualRun,
  submitLiveRun as submitLiveRunToServer,
  type PhoneGpsRunPoint,
  type RunDetail,
  type RunSummary,
} from "../services/runService";

export type { RunDetail, RunPoint, RunSummary } from "../services/runService";

export const useRunsStore = defineStore("runs", {
  state: () => ({
    runs: [] as RunSummary[],
    loaded: false,
  }),
  actions: {
    async load() {
      // offline — list stays whatever it was, no crash
      await withLoadState(getRuns, {
        apply: (runs) => (this.runs = runs),
        setLoaded: (v) => (this.loaded = v),
      });
    },

    async loadDetail(id: string): Promise<RunDetail> {
      return getRunDetail(id);
    },

    async importFile(file: File): Promise<RunSummary> {
      const run = await importRunFile(file);
      await this.load();
      return run;
    },

    async logManual(input: {
      name: string | null;
      startedAt: string;
      distanceM: number;
      durationS: number;
      plannedRouteId?: string | null;
      elevationGainM?: number | null;
    }) {
      await logManualRun(input);
      await this.load();
    },

    /** `clientId` isn't used here today (no client-side dedup/idempotency check yet) — kept in
     *  the input shape since LiveRunScreen.vue already generates one per finish() attempt, so a
     *  future retry-safe resubmit doesn't need a signature change to add it. */
    async submitLiveRun(input: { clientId: string; name: string | null; points: PhoneGpsRunPoint[] }): Promise<RunSummary> {
      const run = await submitLiveRunToServer(input);
      await this.load();
      return run;
    },

    async deleteRun(id: string) {
      await deleteRunOnServer(id);
      this.runs = this.runs.filter((r) => r.id !== id);
    },
  },
});
