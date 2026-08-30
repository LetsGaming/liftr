/** Runs (plan Phase 4), backed by /api/runs. */
import { defineStore } from "pinia";
import {
  deleteRun as deleteRunOnServer,
  getRunDetail,
  getRuns,
  importRunFile,
  logManualRun,
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
      try {
        this.runs = await getRuns();
        this.loaded = true;
      } catch {
        // offline — list stays whatever it was, no crash
      }
    },

    async loadDetail(id: string): Promise<RunDetail> {
      return getRunDetail(id);
    },

    async importFile(file: File): Promise<RunSummary> {
      const run = await importRunFile(file);
      await this.load();
      return run;
    },

    async logManual(input: { name: string | null; startedAt: string; distanceM: number; durationS: number }) {
      await logManualRun(input);
      await this.load();
    },

    async deleteRun(id: string) {
      await deleteRunOnServer(id);
      this.runs = this.runs.filter((r) => r.id !== id);
    },
  },
});
