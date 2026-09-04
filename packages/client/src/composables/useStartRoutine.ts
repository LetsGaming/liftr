/**
 * Starting a workout (from a saved routine, or the ad-hoc "Quick Start" fallback) — extracted
 * out of WorkoutPage.vue so the dashboard's launchpad card (OverviewPage.vue) can start a
 * workout with one tap too, without a second, drifting copy of this logic. Both call sites
 * share the same "last time" fetch, mesocycle weight scaling, and store.start() call.
 */
import { applyMesocycleWeek } from "@liftr/shared";
import { ref } from "vue";
import { getExerciseHistory } from "../services/exerciseService";
import { recommendExercises } from "../services/routineService";
import { useActiveWorkoutStore, type StartExerciseInput } from "../stores/activeWorkoutStore";
import { useCatalogStore } from "../stores/catalogStore";
import type { Routine } from "../stores/routineStore";
import { useExerciseName } from "./useExerciseName";

export function useStartRoutine() {
  const store = useActiveWorkoutStore();
  const catalog = useCatalogStore();
  const { exerciseName } = useExerciseName();
  const starting = ref(false);

  async function fetchLastTime(exerciseId: string) {
    try {
      const sets = await getExerciseHistory(exerciseId);
      const bySetIndex = new Map<number, { weightKg: number | null; reps: number }>();
      for (const s of sets) if (!bySetIndex.has(s.setIndex)) bySetIndex.set(s.setIndex, s);
      return Array.from({ length: 5 }, (_, i) => bySetIndex.get(i) ?? { weightKg: null, reps: 0 });
    } catch {
      return undefined; // offline with nothing cached — start fresh, no "last time" reference
    }
  }

  async function startRoutine(routine: Routine) {
    starting.value = true;
    try {
      // Mesocycle (plan §6.8): this week's intensity % scales the suggested starting weight.
      const weekPercent = routine.mesocycle?.weekPercents[routine.mesocycle.currentWeek - 1] ?? 100;

      const inputs: StartExerciseInput[] = await Promise.all(
        routine.routineExercises
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map(async (re): Promise<StartExerciseInput> => {
            const lastTime = await fetchLastTime(re.exercise.id);
            const scaledLastTime =
              weekPercent !== 100 && lastTime
                ? lastTime.map((s) => ({ ...s, weightKg: applyMesocycleWeek(s.weightKg, weekPercent) }))
                : lastTime;
            return {
              exerciseId: re.exercise.id,
              name: exerciseName(re.exercise.slug, re.exercise.name),
              isBodyweight: re.exercise.isBodyweight,
              targetSets: re.targetSets,
              supersetGroup: re.supersetGroup,
              restBetweenSetsSeconds: re.restBetweenSetsSeconds,
              restAfterExerciseSeconds: re.restAfterExerciseSeconds,
              lastTime: scaledLastTime,
            };
          }),
      );
      await store.start(routine.id, routine.name, inputs);
    } finally {
      starting.value = false;
    }
  }

  async function quickStart() {
    starting.value = true;
    try {
      const exercises = catalog.exercises.slice(0, 4);

      // QUAL-04: was a flat "8 reps, 0 kg" regardless of the lifter's stated experience level or
      // history — now the same server-side recommendation engine the muscle-group suggester uses
      // (falls back to the profile's experienceLevel automatically when omitted here). Best-effort:
      // offline or a failed request just keeps the flat default rather than blocking Quick Start.
      const recommended = await recommendExercises(exercises.map((ex) => ex.id)).catch(() => []);
      const targetSetsByExerciseId = new Map(recommended.map((r) => [r.exerciseId, r.targetSets]));
      const fallbackTargetSets = [
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
      ];

      const inputs: StartExerciseInput[] = await Promise.all(
        exercises.map(async (ex): Promise<StartExerciseInput> => ({
          exerciseId: ex.id,
          name: exerciseName(ex.slug, ex.name),
          isBodyweight: ex.isBodyweight,
          targetSets: targetSetsByExerciseId.get(ex.id) ?? fallbackTargetSets,
          lastTime: await fetchLastTime(ex.id),
        })),
      );
      await store.start(null, "Quick Start", inputs);
    } finally {
      starting.value = false;
    }
  }

  return { starting, startRoutine, quickStart, exerciseName };
}
