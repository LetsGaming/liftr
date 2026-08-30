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
    showXp: getShowXp(),
  }),
  actions: {
    async load() {
      try {
        const res = await getXp();
        this.$patch({ ...res, loaded: true });
      } catch {
        // offline — chip just doesn't update this session
      }
    },
    toggleShowXp() {
      this.showXp = !this.showXp;
      setShowXp(this.showXp);
    },
  },
});
