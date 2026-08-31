/**
 * Per-routine action menu (⋮ → edit / duplicate / delete) plus the routine-builder modal's
 * open/edit state — coupled because editing opens the same builder "+ Neue Routine" does, just
 * pre-filled. Extracted out of WorkoutPage.vue (QUAL-03).
 */
import { onUnmounted, ref } from "vue";
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

  /** Click-outside + Escape dismissal (audit finding: an open ⋮ menu previously had no way to
   *  dismiss it besides its own trigger/action buttons). Clicks inside any routine card's menu
   *  wrapper (trigger button or the menu itself) are left alone so the trigger's own toggle and
   *  the menu's action buttons keep working unchanged; everything else closes the menu. */
  function onDocumentClick(event: MouseEvent) {
    if (openMenuId.value === null) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".rc-menu-wrap")) return;
    openMenuId.value = null;
  }

  function onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && openMenuId.value !== null) {
      openMenuId.value = null;
    }
  }

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  onUnmounted(() => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

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
