import type { LiftrDb } from "@liftr/db";
import { NotFoundError } from "../lib/errors.js";
import { deleteWorkout, findWorkoutWithExercises } from "../repositories/workoutRepository.js";
import { recomputeRankForExercise } from "./rankService.js";

/**
 * DELETE /api/workouts/:id — deleting a workout also removes the XP and LP it earned. Deleting
 * the row cascades to workout_exercises → sets (FK cascade, enabled via
 * `PRAGMA foreign_keys = ON` in db/src/client.ts) — that alone fixes
 * XP, since /api/xp is never cached, just summed fresh from whatever sets currently exist.
 * LP *is* cached (the `ranks` table), so every exercise this workout touched gets an explicit
 * recompute afterward to bring its rank back down to what the remaining history actually
 * supports. `prs` rows aren't cleaned up here — they're an internal append-only "was this ever
 * a new best" log the app never displays (see rankService.ts), not part of what's visibly
 * "gained"; the very rare case where this leaves a phantom highest-ever value only delays a
 * future celebration flagging as a new record, it doesn't affect LP or XP.
 *
 * The one real decision in this file (cascade-then-recompute, not just a delete) — why this
 * isn't just a repository call.
 */
export async function deleteWorkoutAndRecomputeRanks(db: LiftrDb, userId: string, id: string): Promise<void> {
  const workout = await findWorkoutWithExercises(db, userId, id);
  if (!workout) throw new NotFoundError();

  const exerciseIds = [...new Set(workout.workoutExercises.map((we) => we.exerciseId))];

  await deleteWorkout(db, userId, id);

  for (const exerciseId of exerciseIds) {
    await recomputeRankForExercise(db, userId, exerciseId);
  }
}
