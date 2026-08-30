import { and, desc, eq, inArray } from "drizzle-orm";
import { exerciseMuscles, exercises, muscles, sets, workoutExercises, type LiftrDb } from "@liftr/db";

export function findMusclesBySlugs(db: LiftrDb, slugs: string[]) {
  return db.query.muscles.findMany({ where: inArray(muscles.slug, slugs) });
}

/** Primary-only involvement rows for the given muscle ids, each joined with its exercise —
 *  "train chest" should suggest chest-primary movements, not every exercise that merely uses
 *  chest as a secondary stabilizer. */
export function findPrimaryExerciseMusclesForMuscles(db: LiftrDb, muscleIds: string[]) {
  return db.query.exerciseMuscles.findMany({
    where: and(inArray(exerciseMuscles.muscleId, muscleIds), eq(exerciseMuscles.role, "primary")),
    with: { exercise: true },
  });
}

export function findExercisesByIds(db: LiftrDb, ids: string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return db.query.exercises.findMany({ where: inArray(exercises.id, ids) });
}

/** The lifter's most recent non-warmup set for one exercise, or none if never logged. */
export async function findLastPerformedSet(db: LiftrDb, exerciseId: string) {
  const rows = await db
    .select({ weightKg: sets.weightKg, reps: sets.reps })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(sets.isWarmup, false)))
    .orderBy(desc(sets.loggedAt))
    .limit(1);
  return rows[0] ?? null;
}
