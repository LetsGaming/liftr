import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { ranks, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";

export function findFinishedWorkoutsPage(db: LiftrDb, before: Date, limit: number) {
  return db.query.workouts.findMany({
    where: and(isNotNull(workouts.endedAt), lt(workouts.startedAt, before)),
    orderBy: desc(workouts.startedAt),
    limit,
    with: { workoutExercises: { with: { sets: true, exercise: true } }, routine: true },
  });
}

export function findRecentRunsPage(db: LiftrDb, before: Date, limit: number) {
  return db.query.runs.findMany({
    where: lt(runs.startedAt, before),
    orderBy: desc(runs.startedAt),
    limit,
  });
}

export function findRanksByExerciseIds(db: LiftrDb, exerciseIds: string[]) {
  if (exerciseIds.length === 0) return Promise.resolve([]);
  return db.query.ranks.findMany({ where: inArray(ranks.exerciseId, exerciseIds) });
}

export function findSetHistoryForExercise(db: LiftrDb, exerciseId: string, limit = 200) {
  return db
    .select({
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      loggedAt: sets.loggedAt,
      isWarmup: sets.isWarmup,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(eq(workoutExercises.exerciseId, exerciseId))
    .orderBy(desc(sets.loggedAt))
    .limit(limit);
}
