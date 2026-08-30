import { onUnmounted, ref } from "vue";

/**
 * Tap-twice-to-confirm for a destructive action (delete a routine, cancel a workout, close a
 * wizard with unsaved changes) — deliberately not a native confirm() dialog (those block
 * automation and read as jarring on mobile). Was hand-rolled independently at three call
 * sites (WorkoutPage's confirmDelete/confirmDeleteId + cancelWorkout/confirmCancelWorkout,
 * RoutineWizard's requestClose/confirmClose), each with its own ref + setTimeout pair and,
 * notably, no cleanup on unmount anywhere — fixed here once via onUnmounted.
 *
 * `key` distinguishes multiple armable targets sharing one composable instance (e.g. a list of
 * routine cards, each with its own delete button) — pass the routine id as the key. For a
 * single boolean toggle (cancel-workout, close-wizard), omit it and it defaults to `true`.
 */
export function useConfirmTap(onConfirm: (key?: string) => void, ms = 3000) {
  const armedKey = ref<string | true | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function trigger(key: string | true = true) {
    if (armedKey.value === key) {
      if (timer) clearTimeout(timer);
      armedKey.value = null;
      onConfirm(key === true ? undefined : key);
      return;
    }
    armedKey.value = key;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (armedKey.value = null), ms);
  }

  function isArmed(key: string | true = true): boolean {
    return armedKey.value === key;
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });

  return { armedKey, trigger, isArmed };
}
