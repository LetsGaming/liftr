import { inject, reactive, type InjectionKey } from "vue";
import type { ExperienceLevel } from "../../stores/settingsStore";

/**
 * The wizard's whole draft as one reactive object, mutated directly by each step component —
 * same pattern RoutineWizard.vue's `selected` reactive Map uses (mutating a reactive object
 * passed down as a prop is fine in Vue, the prop reference itself is never reassigned), so every
 * step stays a thin, mostly-presentational child instead of round-tripping values through
 * v-model props on each field.
 */
/** The bar-family equipment types the onboarding plates step asks about — a barbell, EZ-bar,
 *  trap-bar, and adjustable-dumbbell handle all have meaningfully different empty weights
 *  (feedback: "usually a barbell has a different weight than a dumbbell"). Product-confirmed
 *  bug (2026-09-06): this step only asked for the barbell-family weight, never the dumbbell's —
 *  "dumbbell" is now a 4th row here too, same as ProfilePage.vue's later-editable copy of this
 *  same step (that file's own dumbbell row already existed; only onboarding's first pass was
 *  missing it, not a deliberate omission worth keeping). */
export type BarType = "barbell" | "ez-bar" | "trap-bar" | "dumbbell";
export const BAR_TYPES: BarType[] = ["barbell", "ez-bar", "trap-bar", "dumbbell"];
export const DEFAULT_BAR_WEIGHTS_KG: Record<BarType, number> = { barbell: 20, "ez-bar": 10, "trap-bar": 25, dumbbell: 2.5 };
/** Per-type max (kg), mirrors the server's barWeightsInput schema (settings.ts) exactly — an
 *  adjustable-dumbbell *handle* tops out far lower than a full barbell (schema caps it at 10kg;
 *  everything else at 50kg). Onboarding's stepper must respect this or a saved value can fail
 *  server-side validation silently dropping the whole gym-setup save. */
export const MAX_BAR_WEIGHT_KG: Record<BarType, number> = { barbell: 50, "ez-bar": 50, "trap-bar": 50, dumbbell: 10 };
export const MIN_BAR_WEIGHT_KG: Record<BarType, number> = { barbell: 5, "ez-bar": 5, "trap-bar": 5, dumbbell: 1 };

export interface OnboardingDraft {
  sex: "male" | "female" | null;
  birthYearInput: string;
  weightInput: string;
  experienceLevel: ExperienceLevel | null;
  workoutsPerWeek: number;
  equipment: Set<string>;
  /** Only populated for bar types actually owned — see needsPlatesStep. */
  barWeightsKg: Map<BarType, number>;
  /** plate weight (kg) -> owned count, only positive entries kept. */
  plates: Map<number, number>;
}

/**
 * Provided by OnboardingGuide.vue, injected by every step component — not passed as a `defineProps`
 * prop, deliberately: these steps mutate fields on it directly (same "shared reactive object"
 * pattern as RoutineWizard.vue's `selected` Map), and `vue/no-mutating-props` flags exactly that
 * shape when it arrives via props. Injection carries the same reactive object without tripping a
 * lint rule aimed at a different problem (a child silently mutating data it was only lent
 * read-only) — these step components aren't reusable elsewhere, they're this wizard's own parts.
 */
export const ONBOARDING_DRAFT_KEY: InjectionKey<OnboardingDraft> = Symbol("onboardingDraft");

export function useOnboardingDraft(): OnboardingDraft {
  const draft = inject(ONBOARDING_DRAFT_KEY);
  if (!draft) throw new Error("useOnboardingDraft() called outside OnboardingGuide's provide scope");
  return draft;
}

export function createOnboardingDraft(): OnboardingDraft {
  return reactive({
    sex: null,
    birthYearInput: "",
    weightInput: "",
    experienceLevel: null,
    workoutsPerWeek: 3,
    equipment: new Set(["bodyweight"]),
    barWeightsKg: new Map(),
    plates: new Map(),
  }) as OnboardingDraft;
}

export function parsedWeightKg(draft: OnboardingDraft): number | null {
  const v = Number(draft.weightInput.replace(",", "."));
  return !Number.isNaN(v) && v > 0 && v < 400 ? v : null;
}

export function parsedBirthYear(draft: OnboardingDraft): number | null {
  const v = Number(draft.birthYearInput);
  return Number.isInteger(v) && v >= 1900 && v <= new Date().getFullYear() ? v : null;
}

/** A barbell-family item (or a dumbbell, whose adjustable handle also has a configurable empty
 *  weight) was picked — only then does asking about bar/handle weight (and, for the barbell
 *  family, plate inventory) make sense. */
export function needsPlatesStep(draft: OnboardingDraft): boolean {
  return (
    draft.equipment.has("barbell") ||
    draft.equipment.has("ez-bar") ||
    draft.equipment.has("trap-bar") ||
    draft.equipment.has("dumbbell")
  );
}
