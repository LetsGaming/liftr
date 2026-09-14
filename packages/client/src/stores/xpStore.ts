/** XP / level, backed by /api/xp. Purely additive display — never gates anything. */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import { getXp } from "../services/xpService";

const SHOW_XP_KEY = "liftr.showXp";

export function getShowXp(): boolean {
  return localStorage.getItem(SHOW_XP_KEY) !== "false"; // default on
}

export function setShowXp(show: boolean) {
  localStorage.setItem(SHOW_XP_KEY, String(show));
}

export const useXpStore = defineStore("xp", {
  state: () => ({
    totalXp: 0,
    level: 0,
    xpIntoLevel: 0,
    xpForNextLevel: 100,
    progressPercent: 0,
    loaded: false,
    error: false,
    showXp: getShowXp(),
  }),
  actions: {
    async load() {
      // A failed load used to leave `loaded` false forever with no signal distinguishing
      // "still fetching" from "never going to arrive" — withLoadState's `error` flag (see
      // ../lib/loadState.ts) is what lets the caller (OverviewPage's stalled-load banner) tell
      // the two apart.
      await withLoadState(getXp, {
        apply: (res) => this.$patch(res),
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
      });
    },
    toggleShowXp() {
      this.showXp = !this.showXp;
      setShowXp(this.showXp);
    },
  },
});
