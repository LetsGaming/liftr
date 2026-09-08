import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, ranks, sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { NotFoundError } from "~server/lib/errors.js";
import { deleteWorkoutAndRecomputeRanks } from "~server/services/workoutService.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function seedStandards(exerciseId: string) {
  await db.insert(standards).values([
    { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust: "real" },
  ]);
}

/** Inserts a standalone finished workout with a single exercise + set, returning the workout row. */
async function insertWorkoutWithSet(exerciseId: string, weightKg: number, reps: number) {
  const [workout] = await db
    .insert(workouts)
    .values({ clientId: `w-${Math.random()}`, startedAt: new Date(), pausedSeconds: 0 })
    .returning();
  const [we] = await db
    .insert(workoutExercises)
    .values({ workoutId: workout!.id, exerciseId, orderIndex: 0 })
    .returning();
  await db.insert(sets).values({
    workoutExerciseId: we!.id,
    setIndex: 0,
    weightKg,
    reps,
    kind: "normal",
    isWarmup: false,
    loggedAt: new Date(),
    clientId: `s-${Math.random()}`,
  });
  return workout!;
}

describe("deleteWorkoutAndRecomputeRanks", () => {
  it("throws NotFoundError for a workout id that doesn't exist", async () => {
    await expect(deleteWorkoutAndRecomputeRanks(db, OWNER_USER_ID, "nonexistent-id")).rejects.toThrow(NotFoundError);
  });

  it("removes the workout row and cascades to its workout_exercises/sets", async () => {
    const exercise = await insertTestExercise(db);
    await seedStandards(exercise.id);
    const workout = await insertWorkoutWithSet(exercise.id, 60, 8);
    const weBefore = await db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
    expect(weBefore).toHaveLength(1);

    await deleteWorkoutAndRecomputeRanks(db, OWNER_USER_ID, workout.id);

    const remainingWorkout = await db.select().from(workouts).where(eq(workouts.id, workout.id));
    expect(remainingWorkout).toHaveLength(0);
    const remainingWe = await db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
    expect(remainingWe).toHaveLength(0);
    const remainingSets = await db.select().from(sets).where(eq(sets.workoutExerciseId, weBefore[0]!.id));
    expect(remainingSets).toHaveLength(0);
  });

  it("does not create a rank row for an exercise left with zero logged sets after deletion", async () => {
    const exercise = await insertTestExercise(db);
    await seedStandards(exercise.id);
    // this is the exercise's only workout -- deleting it leaves no sets to recompute a rank from
    const workout = await insertWorkoutWithSet(exercise.id, 60, 8);

    await deleteWorkoutAndRecomputeRanks(db, OWNER_USER_ID, workout.id);

    const rank = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, exercise.id) });
    expect(rank).toBeUndefined();
  });

  it("recomputes rank down to what the remaining history supports once the strongest workout is deleted", async () => {
    const exercise = await insertTestExercise(db);
    await seedStandards(exercise.id);
    // 90kg x 8 at the 75kg fallback bodyweight -> ratio ~1.52 -> would resolve athlete; this is
    // the workout we delete.
    const strongWorkout = await insertWorkoutWithSet(exercise.id, 90, 8);
    // 60kg x 8 -> ratio ~1.01 -> apprentice; this workout stays.
    await insertWorkoutWithSet(exercise.id, 60, 8);

    await deleteWorkoutAndRecomputeRanks(db, OWNER_USER_ID, strongWorkout.id);

    const rank = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, exercise.id) });
    expect(rank).toBeDefined();
    // reflects only the remaining, weaker workout's history -- not the deleted strong one.
    expect(rank!.tier).toBe("apprentice");
  });

  it("recomputes ranks for every distinct exercise touched by the workout, not just the first", async () => {
    const exerciseA = await insertTestExercise(db);
    const exerciseB = await insertTestExercise(db);
    await seedStandards(exerciseA.id);
    await seedStandards(exerciseB.id);

    const [workout] = await db.insert(workouts).values({ clientId: "w-multi", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [weA] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exerciseA.id, orderIndex: 0 })
      .returning();
    const [weB] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exerciseB.id, orderIndex: 1 })
      .returning();
    await db.insert(sets).values([
      { workoutExerciseId: weA!.id, setIndex: 0, weightKg: 60, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-a1" },
      { workoutExerciseId: weB!.id, setIndex: 0, weightKg: 60, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-b1" },
    ]);
    // one more workout per exercise, kept, so each still has history to recompute a rank from
    // after the shared workout above is deleted.
    await insertWorkoutWithSet(exerciseA.id, 60, 8);
    await insertWorkoutWithSet(exerciseB.id, 60, 8);

    await deleteWorkoutAndRecomputeRanks(db, OWNER_USER_ID, workout!.id);

    const rankA = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, exerciseA.id) });
    const rankB = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, exerciseB.id) });
    expect(rankA).toBeDefined();
    expect(rankB).toBeDefined();
  });

  it("only recomputes each distinct exercise once even when multiple sets in the deleted workout touched it", async () => {
    const exercise = await insertTestExercise(db);
    await seedStandards(exercise.id);
    const [workout] = await db.insert(workouts).values({ clientId: "w-dup", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values([
      { workoutExerciseId: we!.id, setIndex: 0, weightKg: 60, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-dup1" },
      { workoutExerciseId: we!.id, setIndex: 1, weightKg: 65, reps: 6, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-dup2" },
    ]);
    await insertWorkoutWithSet(exercise.id, 60, 8); // kept, so a rank recompute has something to work with

    // must not throw even though the exercise is touched by two sets within the same workout
    await expect(deleteWorkoutAndRecomputeRanks(db, OWNER_USER_ID, workout!.id)).resolves.toBeUndefined();
  });
});
