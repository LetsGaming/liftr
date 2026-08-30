import { inject, reactive, type InjectionKey } from "vue";
import type { ExperienceLevel } from "../../stores/settingsStore";

/**
 * The wizard's whole draft as one reactive object, mutated directly by each step component —
 * same pattern RoutineWizard.vue's `selected` reactive Map uses (mutating a reactive object
 * passed down as a prop is fine in Vue, the prop reference itself is never reassigned), so every
 * step stays a thin, mostly-presentational child instead of round-tripping values through
 * v-model props on each field.
 */
/** The three bar-family equipment types the onboarding plates step asks about — a barbell,
 *  EZ-bar, and trap-bar all have meaningfully different empty weights (feedback: "usually a
 *  barbell has a different weight than a dumbbell"). Adjustable-dumbbell handle weight is a
 *  rarer setup, configured later on Profil instead of adding a 4th row to first-run onboarding. */
export type BarType = "barbell" | "ez-bar" | "trap-bar";
export const BAR_TYPES: BarType[] = ["barbell", "ez-bar", "trap-bar"];
export const DEFAULT_BAR_WEIGHTS_KG: Record<BarType, number> = { barbell: 20, "ez-bar": 10, "trap-bar": 25 };

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

/** A barbell-family item was picked — only then does asking about plate inventory make sense. */
export function needsPlatesStep(draft: OnboardingDraft): boolean {
  return draft.equipment.has("barbell") || draft.equipment.has("ez-bar") || draft.equipment.has("trap-bar");
}
