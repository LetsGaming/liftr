import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  exerciseMuscles,
  exercises,
  muscles,
  routineExercises,
  routines,
  runMigrations,
  sets,
  streaks,
  workoutExercises,
  workouts,
  type LiftrDb,
} from "@liftr/db";

let db: LiftrDb;

beforeEach(() => {
  db = createDb(":memory:");
  runMigrations(db);
});

async function insertExercise(overrides: Partial<typeof exercises.$inferInsert> = {}) {
  const [row] = await db
    .insert(exercises)
    .values({
      slug: `exercise-${Math.random().toString(36).slice(2, 8)}`,
      movementPattern: "push",
      ...overrides,
    })
    .returning();
  return row!;
}

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

describe("uniqueness constraints", () => {
  it("rejects a second exercise with the same slug", async () => {
    await insertExercise({ slug: "bench-press" });

    await expect(insertExercise({ slug: "bench-press" })).rejects.toThrow();
  });

  it("rejects a second streak row for the same date + kind (streaks_date_kind_idx)", async () => {
    await db.insert(streaks).values({ date: "2026-09-07", kind: "workout" });

    await expect(db.insert(streaks).values({ date: "2026-09-07", kind: "workout" })).rejects.toThrow();
  });

  it("allows the same date with a different kind (the unique index is on the pair, not the date alone)", async () => {
    await db.insert(streaks).values({ date: "2026-09-07", kind: "workout" });

    await expect(db.insert(streaks).values({ date: "2026-09-07", kind: "run" })).resolves.not.toThrow();
  });
});

describe("NOT NULL constraints", () => {
  it("rejects an exercise insert missing the required movementPattern column", async () => {
    await expect(
      db.insert(exercises).values({ slug: "no-pattern", movementPattern: undefined as unknown as string }),
    ).rejects.toThrow();
  });
});

describe("foreign key cascade behavior", () => {
  it("cascades exercise_muscles rows when the exercise they tag is deleted", async () => {
    const exercise = await insertExercise();
    const muscle = await insertMuscle("chest");
    await db.insert(exerciseMuscles).values({ exerciseId: exercise.id, muscleId: muscle.id, role: "primary" });

    await db.delete(exercises).where(eq(exercises.id, exercise.id));

    const remaining = await db.query.exerciseMuscles.findMany({
      where: (em, { eq }) => eq(em.exerciseId, exercise.id),
    });
    expect(remaining).toHaveLength(0);
  });

  it("cascades sets when their workout_exercise is deleted", async () => {
    const exercise = await insertExercise();
    const [workout] = await db.insert(workouts).values({ startedAt: new Date(), clientId: "wk-1" }).returning();
    const [workoutExercise] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id })
      .returning();
    await db.insert(sets).values({
      workoutExerciseId: workoutExercise!.id,
      setIndex: 0,
      reps: 5,
      loggedAt: new Date(),
      clientId: "set-1",
    });

    await db.delete(workoutExercises).where(eq(workoutExercises.id, workoutExercise!.id));

    const remaining = await db.query.sets.findMany({
      where: (s, { eq: whereEq }) => whereEq(s.workoutExerciseId, workoutExercise!.id),
    });
    expect(remaining).toHaveLength(0);
  });

  it("sets workouts.routineId to null (not a delete) when the referenced routine is removed", async () => {
    const [routine] = await db.insert(routines).values({ name: "Push Day" }).returning();
    const [workout] = await db
      .insert(workouts)
      .values({ routineId: routine!.id, startedAt: new Date(), clientId: "wk-set-null" })
      .returning();

    await db.delete(routines).where(eq(routines.id, routine!.id));

    const stillThere = await db.query.workouts.findFirst({ where: (w, { eq: whereEq }) => whereEq(w.id, workout!.id) });
    expect(stillThere).toBeDefined();
    expect(stillThere?.routineId).toBeNull();
  });

  it("restricts deleting an exercise that's still referenced by a routine_exercises row", async () => {
    const exercise = await insertExercise();
    const [routine] = await db.insert(routines).values({ name: "Pull Day" }).returning();
    await db.insert(routineExercises).values({ routineId: routine!.id, exerciseId: exercise.id });

    await expect(db.delete(exercises).where(eq(exercises.id, exercise.id))).rejects.toThrow();
  });
});
