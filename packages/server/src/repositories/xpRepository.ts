import { sets, workoutExercises, type LiftrDb } from "@liftr/db";
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
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id));
}
