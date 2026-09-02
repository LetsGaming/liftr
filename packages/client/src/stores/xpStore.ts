/** XP / level (plan Phase 6.4), backed by /api/xp. Purely additive display — never gates anything. */
import { defineStore } from "pinia";
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
      try {
        const res = await getXp();
        this.$patch({ ...res, loaded: true, error: false });
      } catch {
        // Critique finding (harden, P0): a failed load used to leave `loaded` false forever
        // with no signal distinguishing "still fetching" from "never going to arrive" — the
        // caller (OverviewPage's stalled-load banner) reads `error` to tell the two apart.
        this.error = true;
      }
    },
    toggleShowXp() {
      this.showXp = !this.showXp;
      setShowXp(this.showXp);
    },
  },
});
