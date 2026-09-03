/** Personal Records ledger (workplan-v1 §2), backed by /api/prs. */
import { defineStore } from "pinia";
import { getPrs, type PrListItem } from "../services/prService";

export const usePrStore = defineStore("prs", {
  state: () => ({
    prs: [] as PrListItem[],
    loaded: false,
    error: false,
  }),
  actions: {
    async load() {
      try {
        this.prs = await getPrs();
        this.loaded = true;
        this.error = false;
      } catch {
        this.error = true;
      }
    },
  },
});
