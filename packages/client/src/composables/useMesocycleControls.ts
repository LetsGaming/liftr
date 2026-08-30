/**
 * Mesocycle controls (plan §6.8) — a per-routine "+ Mesozyklus" reveal on the not-started
 * routine list, deliberately kept off the routine card itself: this is a planning-desk action
 * like building the routine, not something that should add visual weight to the one-tap
 * "start today's workout" list. Extracted out of WorkoutPage.vue (QUAL-03: that file was the
 * largest in the app, mixing several unrelated concerns) — reusable state/logic, not template.
 */
import { computed, reactive, ref } from "vue";
import type { useActiveWorkoutStore } from "../stores/activeWorkoutStore";
import type { useRoutineStore } from "../stores/routineStore";

const DEFAULT_MESO_WEEKS = 4;
const MIN_MESO_WEEKS = 2;
const MAX_MESO_WEEKS = 16;

export function useMesocycleControls(
  activeWorkoutStore: ReturnType<typeof useActiveWorkoutStore>,
  routineStore: ReturnType<typeof useRoutineStore>,
) {
  const mesoFormRoutineId = ref<string | null>(null);
  const mesoWeeksInput = reactive(new Map<string, number>());

  function toggleMesoForm(routineId: string) {
    mesoFormRoutineId.value = mesoFormRoutineId.value === routineId ? null : routineId;
    if (!mesoWeeksInput.has(routineId)) mesoWeeksInput.set(routineId, DEFAULT_MESO_WEEKS);
  }

  async function startMesocycle(routineId: string) {
    await routineStore.startMesocycle(routineId, mesoWeeksInput.get(routineId) ?? DEFAULT_MESO_WEEKS);
    mesoFormRoutineId.value = null;
  }

  function adjustMesoWeeks(routineId: string, delta: 1 | -1) {
    const current = mesoWeeksInput.get(routineId) ?? DEFAULT_MESO_WEEKS;
    mesoWeeksInput.set(routineId, Math.min(MAX_MESO_WEEKS, Math.max(MIN_MESO_WEEKS, current + delta)));
  }

  /** Shown during an active workout so the mesocycle's effect on today's weights isn't invisible. */
  const activeMesocycle = computed(() => {
    if (!activeWorkoutStore.routineId) return null;
    return routineStore.routines.find((r) => r.id === activeWorkoutStore.routineId)?.mesocycle ?? null;
  });

  return { mesoFormRoutineId, mesoWeeksInput, toggleMesoForm, startMesocycle, adjustMesoWeeks, activeMesocycle };
}
