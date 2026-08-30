/** Streak display (plan Phase 2.4), backed by /api/streak. */
import { defineStore } from "pinia";
import { getStreak } from "../services/streakService";

export const useStreakStore = defineStore("streak", {
  state: () => ({
    streak: 0,
    tokensRemaining: 2,
    loaded: false,
  }),
  actions: {
    async load() {
      try {
        const r = await getStreak();
        this.streak = r.streak;
        this.tokensRemaining = r.tokensRemaining;
        this.loaded = true;
      } catch {
        // offline — chip just shows nothing until back online, not worth caching for this
      }
    },
  },
});
