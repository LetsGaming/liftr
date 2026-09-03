import { and, eq } from "drizzle-orm";
import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";

export function findWorkoutById(db: LiftrDb, id: string) {
  return db.query.workouts.findFirst({ where: eq(workouts.id, id) });
}

export function findWorkoutByClientId(db: LiftrDb, clientId: string) {
  return db.query.workouts.findFirst({ where: eq(workouts.clientId, clientId) });
}

export function findWorkoutWithExercises(db: LiftrDb, id: string) {
  return db.query.workouts.findFirst({ where: eq(workouts.id, id), with: { workoutExercises: true } });
}

/** `prs` is joined per-set (columns trimmed to just `id`) purely to derive a boolean isPr flag
 *  in the route handler — see routes/workouts.ts. Not exposed as a full PR ledger here. */
export function findWorkoutWithExercisesAndSets(db: LiftrDb, id: string) {
  return db.query.workouts.findFirst({
    where: eq(workouts.id, id),
    with: {
      workoutExercises: {
        with: { exercise: true, sets: { with: { prs: { columns: { id: true } } } } },
      },
    },
  });
}

export interface NewWorkout {
  id?: string;
  clientId: string;
  routineId: string | null;
  startedAt: Date;
  pausedSeconds: number;
}

export async function insertWorkout(db: LiftrDb, values: NewWorkout) {
  const [row] = await db.insert(workouts).values(values).returning();
  if (!row) throw new Error("workout insert failed");
  return row;
}

export interface NewWorkoutExercise {
  id?: string;
  workoutId: string;
  exerciseId: string;
  orderIndex: number;
}

export function insertWorkoutExercises(db: LiftrDb, rows: NewWorkoutExercise[]) {
  if (rows.length === 0) return Promise.resolve();
  return db.insert(workoutExercises).values(rows);
}

export function findWorkoutExerciseById(db: LiftrDb, id: string) {
  return db.query.workoutExercises.findFirst({ where: eq(workoutExercises.id, id) });
}

export async function insertWorkoutExercise(db: LiftrDb, values: Required<NewWorkoutExercise>) {
  const [row] = await db.insert(workoutExercises).values(values).returning();
  if (!row) throw new Error("workout_exercise insert failed");
  return row;
}

export function patchWorkout(
  db: LiftrDb,
  id: string,
  patch: { endedAt?: Date; pausedSeconds?: number; notes?: string | null; plausibilityMultiplier?: number },
) {
  return db.update(workouts).set(patch).where(eq(workouts.id, id));
}

export function deleteWorkout(db: LiftrDb, id: string) {
  return db.delete(workouts).where(eq(workouts.id, id));
}

/** Every exercise touched by at least one non-warmup set in this workout — the set a
 *  finish_workout sync item recomputes ranks for. */
export function findTouchedExerciseIds(db: LiftrDb, workoutId: string) {
  return db
    .selectDistinct({ exerciseId: workoutExercises.exerciseId })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(sets.isWarmup, false)));
}
