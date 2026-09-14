/** Bodyweight log, used in place of the rank engine's hardcoded 75kg fallback. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import { getBodyweightLogs, logBodyweight, type BodyweightEntry } from "../services/bodyweightService";

export type { BodyweightEntry };

export const useBodyweightStore = defineStore("bodyweight", {
  state: () => ({
    entries: [] as BodyweightEntry[],
    loaded: false,
    error: false,
  }),
  getters: {
    latest: (state): BodyweightEntry | null => state.entries[0] ?? null,
  },
  actions: {
    async load() {
      await withLoadState(getBodyweightLogs, {
        apply: (entries) => (this.entries = entries),
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
      });
    },
    async log(weightKg: number) {
      const date = new Date().toISOString().slice(0, 10);
      await logBodyweight(date, weightKg);
      await this.load();
    },
  },
});
