/**
 * Exercise catalog (plan 1.2/1.3). The Workbox CacheFirst rule in vite.config.ts already
 * caches the raw /api/exercises response for offline GETs; this store additionally keeps the
 * parsed result in memory for the session and in localStorage as a synchronous fallback so the
 * workout screen has something to render even before the first fetch resolves on a cold offline
 * start (Workbox cache reads are async and there's no point blocking first paint on them).
 */
import { defineStore } from "pinia";
import { getExercises, type CatalogExercise } from "../services/exerciseService";

export type { CatalogExercise };

// v2: requiredEquipment moved from a flat string[] to TieredRequirement[] ({item, tier}) — a
// stale v1 cache entry has plain strings there, and missingByTier() destructuring {item, tier}
// off a string crashes (`result[undefined].push` — TypeError) before the fresh fetch below ever
// gets a chance to overwrite it. Bumping invalidates any pre-existing cached shape instead of
// requiring every reader to defensively handle a schema this store itself controls.
const CACHE_KEY = "liftr.catalog.v2";

export const useCatalogStore = defineStore("catalog", {
  state: () => ({
    exercises: [] as CatalogExercise[],
    loaded: false,
  }),
  getters: {
    byId: (state) => (id: string) => state.exercises.find((e) => e.id === id),
    bySlug: (state) => (slug: string) => state.exercises.find((e) => e.slug === slug),
  },
  actions: {
    async load() {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        this.exercises = JSON.parse(cached);
        this.loaded = true;
      }
      try {
        const fresh = await getExercises();
        this.exercises = fresh;
        this.loaded = true;
        localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      } catch {
        // offline and nothing cached yet: `loaded` stays false, caller shows an empty state
      }
    },
  },
});
