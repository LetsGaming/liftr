/** Bodyweight log (closes the rank-engine's hardcoded-75kg fallback gap). */
import { defineStore } from "pinia";
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
      try {
        this.entries = await getBodyweightLogs();
        this.loaded = true;
        this.error = false;
      } catch {
        // See xpStore.ts's load() for why `error` exists (harden, P0: OverviewPage's
        // stalled-load banner needs to tell "still fetching" from "failed" apart).
        this.error = true;
      }
    },
    async log(weightKg: number) {
      const date = new Date().toISOString().slice(0, 10);
      await logBodyweight(date, weightKg);
      await this.load();
    },
  },
});
