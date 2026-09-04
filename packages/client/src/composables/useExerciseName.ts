import { useI18n } from "vue-i18n";

/**
 * Exercise slug -> localized name/how-to lookup. Was copy-pasted verbatim into 7-8 different
 * components (ExerciseInfoPanel, WorkoutDetail, ExerciseList, RanksPage, OverviewPage,
 * ArrangeStep, ReviewStep, plus useStartRoutine's own copy) — one real function, not a
 * pattern worth re-deriving per file. Falls back to the raw slug (name) or null (how-to) when
 * a translation is missing, e.g. a custom/user-added exercise with no i18n entry yet.
 *
 * Three-step name resolution (WS2, closing the "custom exercises show their slug instead of
 * their name" bug): a stored `name` (set only for custom exercises, since catalog exercises have
 * no literal name column — they resolve via the i18n step below) wins when present; otherwise
 * fall through to the i18n lookup; otherwise the raw slug, same last-resort as before. Existing
 * call sites that don't pass a name (built-in exercises, or call sites without the row handy)
 * keep working unchanged — `name` is an optional second parameter, not a signature break.
 */
export function useExerciseName() {
  const { t } = useI18n();

  function exerciseName(slug: string, name?: string | null): string {
    if (name) return name;
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
