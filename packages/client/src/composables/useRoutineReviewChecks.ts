/** Engagement-audit-v4 Phase 1: the three additive glance-checks that make a routine's review
 *  moment worth looking at — muscle coverage vs. what was requested, an equipment-substitution
 *  flag, and a lopsided set-distribution flag. Shared by ReviewStep.vue (full wizard) and
 *  FastPathStep.vue (the condensed flow for simple routines) so the two never drift. None of
 *  these block Save — they inform, per the audit's explicit "no compliance-theater" constraint. */
import { computed, type Ref } from "vue";
import { useCatalogStore } from "../stores/catalogStore";
import { aggregateMuscles, MUSCLE_LABEL_DE } from "../lib/muscles";
import type { DraftExercise } from "../components/routine-wizard/RoutineWizard.vue";

export type CoverageState = "covered" | "partial" | "missing";
export interface CoverageChip {
  slug: string;
  label: string;
  state: CoverageState;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function useRoutineReviewChecks(
  entries: Ref<[string, DraftExercise][]>,
  requestedMuscleSlugs: Ref<string[]>,
  suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean }>,
) {
  const catalog = useCatalogStore();

  /** "Does this routine actually hit what you said you wanted?" Primary involvement counts as
   *  covered; secondary-only counts as the lighter "indirekt" state. Exercises with no muscle
   *  tags at all (wrist-curl/reverse-wrist-curl — the 15-muscle taxonomy has no forearm shape)
   *  simply contribute nothing to either set, never crash. null when nothing was requested (a
   *  fully manual routine has nothing to compare against). */
  const coverage = computed<CoverageChip[] | null>(() => {
    if (requestedMuscleSlugs.value.length === 0) return null;
    const muscleLists = entries.value.map(([exerciseId]) => catalog.byId(exerciseId)?.muscles ?? []);
    const { primary, secondary } = aggregateMuscles(muscleLists);
    return requestedMuscleSlugs.value.map((slug) => ({
      slug,
      label: MUSCLE_LABEL_DE[slug] ?? slug,
      state: primary.includes(slug) ? "covered" : secondary.includes(slug) ? "partial" : "missing",
    }));
  });

  const setCountMedian = computed(() => median(entries.value.map(([, cfg]) => cfg.sets.length)));

  /** Flags a set count roughly double (or more) the routine's typical count. Needs at least 3
   *  exercises for "typical" to mean anything, and a real gap (>=2 sets over the median, not
   *  just "3 vs 4"). */
  function isLopsided(setCount: number): boolean {
    if (entries.value.length < 3) return false;
    const med = setCountMedian.value;
    return med > 0 && setCount >= med * 2 && setCount - med >= 2;
  }

  function isSubstitute(exerciseId: string): boolean {
    return suggestionMeta[exerciseId]?.isSubstitute === true;
  }

  return { coverage, isLopsided, isSubstitute };
}
