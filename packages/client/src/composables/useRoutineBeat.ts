/**
 * Feedback: "if a user made changes to the routine while in the workout (e.g. more weight/reps
 * than the routine default) it should ask to overwrite the routine." Pure comparison/rebuild
 * logic, kept out of WorkoutPage.vue so it's testable without mounting the page — the litmus
 * test from this project's Vue conventions (domain logic doesn't need a component to run).
 */
import type { ActiveExercise } from "../stores/activeWorkoutStore";
import type { Routine, RoutineExerciseInput } from "../stores/routineStore";

export interface RoutineBeat {
  exerciseId: string;
  name: string;
  setIndex: number;
  targetWeightKg: number | null;
  targetReps: number;
  loggedWeightKg: number | null;
  loggedReps: number;
}

/** A logged set "beats" its routine target if it was done at more weight, or (at the same or no
 *  tracked weight) more reps than planned — warmups never count, they're not the working set. */
function setBeatsTarget(loggedWeightKg: number | null, loggedReps: number, targetWeightKg: number | null, targetReps: number): boolean {
  if (targetWeightKg != null && loggedWeightKg != null && loggedWeightKg > targetWeightKg) return true;
  if ((targetWeightKg == null || loggedWeightKg === targetWeightKg) && loggedReps > targetReps) return true;
  return false;
}

/** Every logged working set that exceeded its routine's target, across the exercises actually
 *  performed this session. `activeExercises` must be read before activeWorkoutStore's finish()
 *  resets the session state. */
export function findRoutineBeats(routine: Routine, activeExercises: ActiveExercise[]): RoutineBeat[] {
  const beats: RoutineBeat[] = [];
  for (const ex of activeExercises) {
    const re = routine.routineExercises.find((r) => r.exerciseId === ex.exerciseId);
    if (!re) continue; // added mid-session, no routine target to compare against
    for (const set of ex.sets) {
      if (!set.logged || set.isWarmup) continue;
      const target = re.targetSets[set.index];
      if (!target) continue; // extra set beyond the routine's planned count — nothing to compare
      if (setBeatsTarget(set.weightKg, set.reps, target.weightKg, target.reps)) {
        beats.push({
          exerciseId: ex.exerciseId,
          name: ex.name,
          setIndex: set.index,
          targetWeightKg: target.weightKg,
          targetReps: target.reps,
          loggedWeightKg: set.weightKg,
          loggedReps: set.reps,
        });
      }
    }
  }
  return beats;
}

/** Rebuilds the routine's full exercise list (PATCH /api/routines/:id replaces it wholesale)
 *  with every set that beat its target raised to what was actually performed. Everything else —
 *  order, superset grouping, rest-time overrides, sets never touched this session — is carried
 *  over unchanged from the routine as it already was. */
export function buildRoutineUpdate(routine: Routine, activeExercises: ActiveExercise[]): RoutineExerciseInput[] {
  const byExerciseId = new Map(activeExercises.map((ex) => [ex.exerciseId, ex]));
  return routine.routineExercises
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((re, orderIndex) => {
      const active = byExerciseId.get(re.exerciseId);
      const targetSets = re.targetSets.map((target, setIndex) => {
        const set = active?.sets.find((s) => s.index === setIndex && s.logged && !s.isWarmup);
        if (!set || !setBeatsTarget(set.weightKg, set.reps, target.weightKg, target.reps)) return target;
        return { reps: set.reps, weightKg: target.weightKg == null ? target.weightKg : set.weightKg };
      });
      return {
        exerciseId: re.exerciseId,
        orderIndex,
        targetSets,
        supersetGroup: re.supersetGroup,
        restBetweenSetsSeconds: re.restBetweenSetsSeconds,
        restAfterExerciseSeconds: re.restAfterExerciseSeconds,
      };
    });
}
