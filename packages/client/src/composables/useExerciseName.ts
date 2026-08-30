import { useI18n } from "vue-i18n";

/**
 * Exercise slug -> localized name/how-to lookup. Was copy-pasted verbatim into 7-8 different
 * components (ExerciseInfoPanel, WorkoutDetail, ExerciseList, RanksPage, OverviewPage,
 * ArrangeStep, ReviewStep, plus useStartRoutine's own copy) — one real function, not a
 * pattern worth re-deriving per file. Falls back to the raw slug (name) or null (how-to) when
 * a translation is missing, e.g. a custom/user-added exercise with no i18n entry yet.
 */
export function useExerciseName() {
  const { t } = useI18n();

  function exerciseName(slug: string): string {
    const key = `exercise.${slug}.name`;
    const translated = t(key);
    return translated === key ? slug : translated;
  }

  function exerciseHowTo(slug: string): string | null {
    const key = `exercise.${slug}.howto`;
    const translated = t(key);
    return translated === key ? null : translated;
  }

  return { exerciseName, exerciseHowTo };
}
