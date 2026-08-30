/**
 * Per-routine action menu (⋮ → edit / duplicate / delete) plus the routine-builder modal's
 * open/edit state — coupled because editing opens the same builder "+ Neue Routine" does, just
 * pre-filled. Extracted out of WorkoutPage.vue (QUAL-03).
 */
import { ref } from "vue";
import { useConfirmTap } from "./useConfirmTap";
import type { useRoutineStore, Routine } from "../stores/routineStore";

export function useRoutineManagement(routineStore: ReturnType<typeof useRoutineStore>) {
  const openMenuId = ref<string | null>(null);
  const editingRoutine = ref<Routine | null>(null);
  const showBuilder = ref(false);

  /** Tap-twice confirm — no native confirm() dialog (those block automation and are jarring on
   *  mobile). */
  const deleteConfirm = useConfirmTap((routineId) => {
    if (routineId) void routineStore.remove(routineId);
  });

  function toggleMenu(routineId: string) {
    openMenuId.value = openMenuId.value === routineId ? null : routineId;
  }

  function editRoutine(routine: Routine) {
    openMenuId.value = null;
    editingRoutine.value = routine;
    showBuilder.value = true;
  }

  async function duplicateRoutine(routine: Routine) {
    openMenuId.value = null;
    await routineStore.duplicate(routine);
  }

  function onRoutineCreated() {
    showBuilder.value = false;
    editingRoutine.value = null;
  }

  return {
    openMenuId,
    editingRoutine,
    showBuilder,
    deleteConfirm,
    toggleMenu,
    editRoutine,
    duplicateRoutine,
    onRoutineCreated,
  };
}
