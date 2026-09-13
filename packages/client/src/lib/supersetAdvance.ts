/**
 * Pure sequencing math for what happens right after a set is logged — extracted out of
 * activeWorkoutStore.ts's logCurrentSet() so the superset round-robin/wraparound logic can be
 * unit tested without a Pinia store or IndexedDB around it. See logCurrentSet() for the full
 * behavioral writeup (rest rules, round-completion detection); this only computes where to go
 * next and how long to rest, it doesn't mutate anything.
 */

interface AdvanceExercise {
  supersetGroup: number | null;
  sets: { logged: boolean }[];
  restBetweenSetsSeconds: number;
  restAfterExerciseSeconds: number;
}

export function computeAdvanceAfterLog<T extends AdvanceExercise>(
  exercises: T[],
  currentIndex: number,
): { nextIndex: number; restSeconds: number | null } {
  const ex = exercises[currentIndex];
  if (!ex) return { nextIndex: currentIndex, restSeconds: null };

  let nextIndex = currentIndex;
  let restSeconds: number | null = ex.restBetweenSetsSeconds;

  if (ex.supersetGroup != null) {
    const groupIndices = exercises
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.supersetGroup === ex.supersetGroup);
    const curPos = groupIndices.findIndex(({ i }) => i === currentIndex);
    let advancedWithinGroup = false;
    for (let step = 1; step < groupIndices.length; step++) {
      const pos = (curPos + step) % groupIndices.length;
      const candidate = groupIndices[pos]!;
      if (candidate.e.sets.some((s) => !s.logged)) {
        nextIndex = candidate.i;
        advancedWithinGroup = true;
        // wrapped back to an earlier/equal slot = round complete
        restSeconds = pos <= curPos ? ex.restBetweenSetsSeconds : null;
        break;
      }
    }
    if (!advancedWithinGroup) {
      const found = exercises.findIndex((e) => e.sets.some((s) => !s.logged));
      if (found !== -1) nextIndex = found;
      restSeconds = ex.restAfterExerciseSeconds;
    }
  } else if (ex.sets.every((s) => s.logged)) {
    // auto-advance to the next exercise with unlogged sets, mirroring the mockup's flow
    const found = exercises.findIndex((e) => e.sets.some((s) => !s.logged));
    if (found !== -1) nextIndex = found;
    restSeconds = ex.restAfterExerciseSeconds;
  }

  return { nextIndex, restSeconds };
}
