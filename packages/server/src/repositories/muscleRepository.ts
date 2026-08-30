import { desc, eq } from "drizzle-orm";
import { exerciseMuscles, exercises, muscles, sets, workoutExercises, type LiftrDb } from "@liftr/db";

export function findAllMuscles(db: LiftrDb) {
  return db.query.muscles.findMany();
}

/** One row per logged set that touched a muscle, most recent first — the raw material
 *  `readinessService.ts` reduces down to "last trained per muscle." */
export function findMuscleTrainingLog(db: LiftrDb) {
  return db
    .select({
      muscleSlug: muscles.slug,
      role: exerciseMuscles.role,
      loggedAt: sets.loggedAt,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, exercises.id))
    .innerJoin(muscles, eq(exerciseMuscles.muscleId, muscles.id))
    .orderBy(desc(sets.loggedAt));
}
