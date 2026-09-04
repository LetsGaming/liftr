import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { exerciseMuscles, exercises, muscles, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";

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
  patch: {
    endedAt?: Date;
    pausedSeconds?: number;
    notes?: string | null;
    plausibilityMultiplier?: number;
    consistencyBonusXp?: number;
    varietyBonusXp?: number;
  },
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

/** The single immediately-preceding *finished* workout (`endedAt` set), used by the variety bonus
 *  to compare "this session's muscles" against "the previous session's muscles"
 *  (docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md). Ordered by `endedAt` desc,
 *  tie-broken by `startedAt` desc — deliberately NOT `startedAt` desc alone (that ordering is used
 *  elsewhere for a chronological feed that legitimately includes in-progress workouts; here we
 *  specifically want the last workout that was actually *completed*).
 *
 *  Excludes `workoutId` itself — mandatory, not defensive: by the time this runs during
 *  finish-workout processing, the current workout's own `endedAt` has typically already been set,
 *  so without this exclusion "previous" could resolve to the current workout. */
export async function findPreviousFinishedWorkout(db: LiftrDb, workoutId: string) {
  const [row] = await db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), ne(workouts.id, workoutId)))
    .orderBy(desc(workouts.endedAt), desc(workouts.startedAt))
    .limit(1);
  return row ?? null;
}

/** Distinct primary-role muscle slugs trained in this workout — the variety bonus's "this
 *  session's muscles" side of the comparison. Primary-only matches this codebase's existing
 *  convention (see routineSuggestionRepository.ts's findPrimaryExerciseMusclesForMuscles) and the
 *  design spec's own resolution of its "primary vs. primary+secondary" open question: primary-only
 *  is the more conservative, less-gameable signal. */
export function findPrimaryMuscleSlugsForWorkout(db: LiftrDb, workoutId: string) {
  return db
    .selectDistinct({ muscleSlug: muscles.slug })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, exercises.id))
    .innerJoin(muscles, eq(exerciseMuscles.muscleId, muscles.id))
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(exerciseMuscles.role, "primary")));
}
