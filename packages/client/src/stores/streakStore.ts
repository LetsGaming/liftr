/** Streak display (plan Phase 2.4), backed by /api/streak. */
import { defineStore } from "pinia";
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
      try {
        const r = await getStreak();
        this.streak = r.streak;
        this.tokensRemaining = r.tokensRemaining;
        this.loaded = true;
        this.error = false;
      } catch {
        // See xpStore.ts's load() for why `error` exists (harden, P0: OverviewPage's
        // stalled-load banner needs to tell "still fetching" from "failed" apart).
        this.error = true;
      }
    },
  },
});
