import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";

/** Every logged set's XP-relevant fields, across every workout this user has ever logged. */
export function findAllSetsForXp(db: LiftrDb, userId: string) {
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
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(sets.userId, userId));
}

/** Sum of the per-workout consistency/variety XP bonuses across every *finished* workout
 *  (`endedAt` not null) this user has. `coalesce(..., 0)` guards the case where this user has no
 *  finished workouts at all — SQL `SUM()` over zero rows yields `null`, not `0`, which would
 *  otherwise propagate into `getXpSummary`'s total as `NaN`. */
export async function findTotalSessionBonusXp(
  db: LiftrDb,
  userId: string,
): Promise<{ totalConsistencyBonusXp: number; totalVarietyBonusXp: number }> {
  const [row] = await db
    .select({
      totalConsistencyBonusXp: sql<number>`coalesce(sum(${workouts.consistencyBonusXp}), 0)`,
      totalVarietyBonusXp: sql<number>`coalesce(sum(${workouts.varietyBonusXp}), 0)`,
    })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), isNotNull(workouts.endedAt)));

  return {
    totalConsistencyBonusXp: row?.totalConsistencyBonusXp ?? 0,
    totalVarietyBonusXp: row?.totalVarietyBonusXp ?? 0,
  };
}
