/**
 * Mid-session "add exercise" (feedback gap: no way to change what a session includes once
 * started — a busy squat rack or a piece of equipment in use dead-ended the workout, or forced
 * cancelling it entirely). Extracted out of WorkoutPage.vue (QUAL-03).
 */
import { computed, ref } from "vue";
import type { useActiveWorkoutStore } from "../stores/activeWorkoutStore";
import type { CatalogExercise } from "../stores/catalogStore";

export function useAddExerciseToSession(
  activeWorkoutStore: ReturnType<typeof useActiveWorkoutStore>,
  catalogExercises: () => CatalogExercise[],
  exerciseName: (slug: string) => string,
) {
  const showAddExercise = ref(false);
  const addExerciseSearch = ref("");

  const addExerciseCandidates = computed(() =>
    catalogExercises()
      .filter((e) => exerciseName(e.slug).toLowerCase().includes(addExerciseSearch.value.toLowerCase()))
      .slice(0, 30),
  );

  async function addExerciseToSession(ex: CatalogExercise) {
    await activeWorkoutStore.addExercise({
      exerciseId: ex.id,
      name: exerciseName(ex.slug),
      isBodyweight: ex.isBodyweight,
      targetSets: [
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
      ],
    });
    showAddExercise.value = false;
    addExerciseSearch.value = "";
  }

  return { showAddExercise, addExerciseSearch, addExerciseCandidates, addExerciseToSession };
}
