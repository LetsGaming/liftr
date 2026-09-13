/**
 * Per-routine action menu (⋮ → edit / duplicate / delete) plus the routine-builder modal's
 * open/edit state — coupled because editing opens the same builder "+ Neue Routine" does, just
 * pre-filled. Extracted out of WorkoutPage.vue. The menu open/close mechanics themselves (one
 * open id at a time, outside-click/Escape dismissal) live in useCardMenu, shared with
 * RouteList.vue.
 */
import { ref } from "vue";
import { useCardMenu } from "./useCardMenu";
import { useConfirmTap } from "./useConfirmTap";
import type { useRoutineStore, Routine } from "../stores/routineStore";

export function useRoutineManagement(routineStore: ReturnType<typeof useRoutineStore>) {
  const { openMenuId, toggleMenu, closeMenu } = useCardMenu();
  const editingRoutine = ref<Routine | null>(null);
  const showBuilder = ref(false);

  /** Tap-twice confirm — no native confirm() dialog (those block automation and are jarring on
   *  mobile). */
  const deleteConfirm = useConfirmTap((routineId) => {
    if (routineId) void routineStore.remove(routineId);
  });

  function editRoutine(routine: Routine) {
    closeMenu();
    editingRoutine.value = routine;
    showBuilder.value = true;
  }

  async function duplicateRoutine(routine: Routine) {
    closeMenu();
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
