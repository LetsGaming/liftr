import { bodyweightLogs, exercises, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { desc, eq } from "drizzle-orm";

/** Every source table the data export pulls from — derived/cache tables (ranks, prs, streaks)
 *  are deliberately excluded, they're rebuildable from this data, not source-of-truth facts. */
export function findAllWorkoutsForExport(db: LiftrDb) {
  return db.query.workouts.findMany({ orderBy: desc(workouts.startedAt) });
}

export function findAllSetsForExport(db: LiftrDb) {
  return db
    .select({
      id: sets.id,
      workoutId: workoutExercises.workoutId,
      exerciseSlug: exercises.slug,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      rpe: sets.rpe,
      isWarmup: sets.isWarmup,
      notes: sets.notes,
      loggedAt: sets.loggedAt,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .orderBy(sets.loggedAt);
}

export function findAllRunsForExport(db: LiftrDb) {
  return db.query.runs.findMany({ orderBy: desc(runs.startedAt) });
}

export function findAllBodyweightLogsForExport(db: LiftrDb) {
  return db.query.bodyweightLogs.findMany({ orderBy: desc(bodyweightLogs.date) });
}
