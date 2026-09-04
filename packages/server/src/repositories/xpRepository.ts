import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { eq, isNotNull, sql } from "drizzle-orm";

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

/** Sum of the per-workout consistency/variety XP bonuses across every *finished* workout
 *  (`endedAt` not null). Null-safe: a finished workout with a null bonus column (e.g. one
 *  finished before this feature shipped) contributes 0 to the corresponding sum — SQL `SUM()`
 *  already skips null inputs, this just makes that explicit and gives a non-null result even
 *  when every row is null (plain `SUM()` would otherwise yield `null`, not `0`). */
export async function findTotalSessionBonusXp(
  db: LiftrDb,
): Promise<{ totalConsistencyBonusXp: number; totalVarietyBonusXp: number }> {
  const [row] = await db
    .select({
      totalConsistencyBonusXp: sql<number>`coalesce(sum(${workouts.consistencyBonusXp}), 0)`,
      totalVarietyBonusXp: sql<number>`coalesce(sum(${workouts.varietyBonusXp}), 0)`,
    })
    .from(workouts)
    .where(isNotNull(workouts.endedAt));

  return {
    totalConsistencyBonusXp: row?.totalConsistencyBonusXp ?? 0,
    totalVarietyBonusXp: row?.totalVarietyBonusXp ?? 0,
  };
}
