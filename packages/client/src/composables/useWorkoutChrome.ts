/**
 * Audit fix (workplan-v1 §1.4/§1.5): the top-hud level/streak chips used to render unconditionally
 * on every screen, including (a) during active set-logging, where they compete with the lowest-
 * density-tolerance screen in the app for space, and (b) during the finish-sequence recap, where
 * FinishSequence.vue's own "Fortschritt" beat already shows the same resolved Lv./XP number —
 * showing both at once with no visual link duplicated the same state twice. `finishedSummary` (the
 * recap flag) lives in useWorkoutFinish.ts as a local ref, not in activeWorkoutStore, and doesn't
 * belong in that store's persisted $state (it's UI-recap visibility, not crash-recoverable session
 * data — activeWorkoutStore.persist() would otherwise round-trip it through IndexedDB for no
 * reason). Module-level reactive singleton instead, same pattern as useToast.ts.
 */
import { ref } from "vue";

export const showingFinishRecap = ref(false);
