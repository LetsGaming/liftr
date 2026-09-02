/**
 * Per-muscle readiness (engagement rework W5), backed by /api/readiness. The server returns raw
 * last-trained facts; the 0-1 readiness number itself is computed here with @liftr/shared's
 * computeReadiness so it's always evaluated against "now" at render time rather than a value
 * that goes stale the moment the page has been open a while.
 */
import { computeReadiness } from "@liftr/shared";
import { defineStore } from "pinia";
import { getReadiness, type MuscleLastTrained } from "../services/readinessService";
import { useSettingsStore } from "./settingsStore";

export const useReadinessStore = defineStore("readiness", {
  state: () => ({
    rows: [] as MuscleLastTrained[],
    loaded: false,
    error: false,
  }),
  getters: {
    /** slug -> 0..1 readiness, recomputed against the current time on every access. `birthYear`
     *  (QUAL-04) only ever widens the recovery window, never shortens it — see
     *  @liftr/shared's computeReadiness for the (deliberately modest, capped) adjustment. */
    heat(state): Record<string, number> {
      const now = new Date();
      const birthYear = useSettingsStore().profile?.birthYear;
      const out: Record<string, number> = {};
      for (const r of state.rows) {
        out[r.slug] = computeReadiness(r.slug, r.lastTrainedAt ? new Date(r.lastTrainedAt) : null, r.wasPrimary, now, birthYear);
      }
      return out;
    },
    /** Muscles at or above this threshold, sorted most-recovered first — feeds the
     *  Erholungszone verdict line ("Quads, Hamstrings und Glutes sind erholt — ..."). */
    recoveredSlugs(): string[] {
      return Object.entries(this.heat)
        .filter(([, v]) => v >= 0.85)
        .sort((a, b) => b[1] - a[1])
        .map(([slug]) => slug);
    },
  },
  actions: {
    async load() {
      try {
        this.rows = await getReadiness();
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
