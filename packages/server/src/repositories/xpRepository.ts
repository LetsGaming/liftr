import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { eq } from "drizzle-orm";

/** Every logged set's XP-relevant fields, across every workout ever. */
export function findAllSetsForXp(db: LiftrDb) {
  return db
    .select({
      weightKg: sets.weightKg,
      reps: sets.reps,
      isWarmup: sets.isWarmup,
      loggedAt: sets.loggedAt,
      exerciseId: workoutExercises.exerciseId,
      plausibilityMultiplier: workouts.plausibilityMultiplier,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id));
}
