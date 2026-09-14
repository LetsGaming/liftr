/** Personal Records ledger, backed by /api/prs. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import { getPrs, type PrListItem } from "../services/prService";

export const usePrStore = defineStore("prs", {
  state: () => ({
    prs: [] as PrListItem[],
    loaded: false,
    error: false,
  }),
  actions: {
    async load() {
      await withLoadState(getPrs, {
        apply: (prs) => (this.prs = prs),
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
      });
    },
  },
});
