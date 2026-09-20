/**
 * Lazily-fetched, per-exercise history cache for ExerciseInfoPanel.vue's Statistiken tab (its
 * e1RM ProgressChart) — extracted so the view stays render+emit only (frontend.md: "a component
 * does not fetch"). Used to also back RankLifterSection.vue's own expand-to-chart interaction on
 * the Ränge grid; that's since been replaced by a flip-to-aggregate-rank interaction there
 * (RankOverallBack.vue), leaving this composable's only caller here.
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
