/**
 * Unified workout+run feed (plan 1.6), backed by the already-working /api/history route.
 * Read-only, online-only for now — the offline story for history is "you see what was synced
 * last time you had signal," which is fine: history is a review surface, not the logging loop.
 */
import { defineStore } from "pinia";
import { getHistoryPage, type HistoryItem } from "../services/historyService";
import { deleteWorkout as deleteWorkoutOnServer, getWorkout, type WorkoutDetail } from "../services/workoutService";

export type { HistoryItem };
export type { WorkoutDetail, WorkoutDetailExercise, WorkoutSetDetail } from "../services/workoutService";

export const useHistoryStore = defineStore("history", {
  state: () => ({
    items: [] as HistoryItem[],
    loaded: false,
    error: false,
    nextCursor: null as string | null,
    loadingMore: false,
    // per-id cache for the detail modal — GET /api/workouts/:id existed and was never called
    // from anywhere in the client before this.
    detailCache: new Map<string, WorkoutDetail>(),
  }),
  actions: {
    async load() {
      try {
        const { items, nextCursor } = await getHistoryPage();
        this.items = items;
        this.nextCursor = nextCursor;
        this.loaded = true;
        this.error = false;
      } catch {
        this.error = true;
      }
    },

    /** Was fetched and silently discarded before — history was permanently capped at 20 rows. */
    async loadMore() {
      if (!this.nextCursor || this.loadingMore) return;
      this.loadingMore = true;
      try {
        const { items, nextCursor } = await getHistoryPage(this.nextCursor);
        this.items.push(...items);
        this.nextCursor = nextCursor;
      } finally {
        this.loadingMore = false;
      }
    },

    async loadWorkout(id: string): Promise<WorkoutDetail | null> {
      const cached = this.detailCache.get(id);
      if (cached) return cached;
      try {
        const detail = await getWorkout(id);
        this.detailCache.set(id, detail);
        return detail;
      } catch {
        return null;
      }
    },

    /** Feedback: "not possible to delete past workouts" — the server cascades sets and
     *  recomputes rank for every touched exercise (server's routes/workouts.ts), so LP/XP are
     *  already correct by the time this resolves; this just drops the row from local state so
     *  the feed and detail cache don't show a workout that no longer exists. */
    async deleteWorkout(id: string) {
      await deleteWorkoutOnServer(id);
      this.items = this.items.filter((i) => !(i.kind === "workout" && i.id === id));
      this.detailCache.delete(id);
    },
  },
});
