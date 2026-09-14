/**
 * Feedback: "not possible to set what kind of set this is (warmup, normal, drop, etc)" — lived
 * only in the client's activeWorkoutStore.ts until routine templates needed the same vocabulary
 * (feature: pre-plan a set's kind when building a routine, not just reclassify it live via
 * SetKindPicker.vue). Moved here so both the client store and the server's routine zod schema
 * can reference one definition instead of the server hand-duplicating the enum.
 */
export type SetKind = "normal" | "warmup" | "failure" | "dropset";

export const SET_KINDS: SetKind[] = ["normal", "warmup", "failure", "dropset"];

/** Single source of truth for the kind's display name (the routine wizard's set-kind badge,
 *  WorkoutPage's set-row badge, and SetKindPicker.vue's option rows all import this, rather than
 *  each hand-writing the same four labels). */
export const SET_KIND_LABEL: Record<SetKind, string> = {
  warmup: "Aufwärmen",
  normal: "Normal",
  failure: "Fehlsatz",
  dropset: "Drop-Satz",
};

/** Short badge letter (A/N/F/D) — the routine wizard's compact per-set chip and
 *  SetKindPicker.vue's option rows both use this instead of the full label. */
export const SET_KIND_BADGE: Record<SetKind, string> = {
  warmup: "A",
  normal: "N",
  failure: "F",
  dropset: "D",
};

/** {reps, weightKg} target-set shape, one target per set. `weightKg: null` means "no weight
 *  target for this set" (plain bodyweight); see routineExercises.targetSets in @liftr/db's
 *  schema.ts for the full rationale. Single source of truth for the 3x8-reps/no-weight default
 *  used both client-side (useAddExerciseToSession.ts, useStartRoutine.ts's quickStart fallback)
 *  and as the literal DB default string in @liftr/db's schema.ts (routineExercises.targetSets) —
 *  a SQL column default can't reference a JS import, so that string must be kept in sync with
 *  this constant by hand; see the comment there. */
export const DEFAULT_TARGET_SETS: { reps: number; weightKg: null }[] = [
  { reps: 8, weightKg: null },
  { reps: 8, weightKg: null },
  { reps: 8, weightKg: null },
];
