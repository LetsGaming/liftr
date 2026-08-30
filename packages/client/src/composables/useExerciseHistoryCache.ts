/**
 * Lazily-fetched, per-exercise history cache for RanksPage.vue's expand-to-chart interaction —
 * extracted so the view stays render+emit only (frontend.md: "a component does not fetch").
 */
import { reactive } from "vue";
import { getExerciseHistory, type ExerciseHistorySet } from "../services/exerciseService";

export function useExerciseHistoryCache() {
  const expanded = reactive(new Set<string>());
  const historyCache = reactive(new Map<string, ExerciseHistorySet[]>());

  async function toggleExpand(exerciseId: string) {
    if (expanded.has(exerciseId)) {
      expanded.delete(exerciseId);
      return;
    }
    expanded.add(exerciseId);
    if (!historyCache.has(exerciseId)) {
      try {
        historyCache.set(exerciseId, await getExerciseHistory(exerciseId));
      } catch {
        historyCache.set(exerciseId, []); // offline — chart just shows "not enough data"
      }
    }
  }

  return { expanded, historyCache, toggleExpand };
}
