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
