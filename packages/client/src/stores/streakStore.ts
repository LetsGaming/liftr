/** Streak display, backed by /api/streak. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import { getStreak } from "../services/streakService";

export const useStreakStore = defineStore("streak", {
  state: () => ({
    streak: 0,
    tokensRemaining: 2,
    loaded: false,
    error: false,
  }),
  actions: {
    async load() {
      await withLoadState(getStreak, {
        apply: (r) => {
          this.streak = r.streak;
          this.tokensRemaining = r.tokensRemaining;
        },
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
      });
    },
  },
});
