import { beforeEach, describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, OWNER_USER_ID, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";
import {
  findExercisesByIds,
  findLastPerformedSet,
  findMusclesBySlugs,
  findPrimaryExerciseMusclesForMuscles,
} from "~server/repositories/routineSuggestionRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

describe("findMusclesBySlugs", () => {
  it("returns only muscles matching the given slugs", async () => {
    await insertMuscle("chest");
    const legs = await insertMuscle("legs");
    await insertMuscle("back");

    const result = await findMusclesBySlugs(db, ["legs", "not-a-real-slug"]);

    expect(result.map((m) => m.id)).toEqual([legs.id]);
  });

  it("returns an empty array when no slugs match", async () => {
    const result = await findMusclesBySlugs(db, ["nonexistent"]);
    expect(result).toEqual([]);
  });
});

describe("findPrimaryExerciseMusclesForMuscles", () => {
  it("returns only primary-role rows, excluding secondary, and includes the joined exercise", async () => {
    const chest = await insertMuscle("chest");
    const triceps = await insertMuscle("triceps");
    const bench = await insertTestExercise(db, { slug: "bench-press" });
    await db.insert(exerciseMuscles).values([
      { exerciseId: bench.id, muscleId: chest.id, role: "primary" },
      { exerciseId: bench.id, muscleId: triceps.id, role: "secondary" },
    ]);

    const result = await findPrimaryExerciseMusclesForMuscles(db, [chest.id, triceps.id]);

    expect(result).toHaveLength(1);
    expect(result[0]!.muscleId).toBe(chest.id);
    expect(result[0]!.exercise.id).toBe(bench.id);
  });

  it("returns an empty array when no exercise has a primary role for the given muscles", async () => {
    const legs = await insertMuscle("legs");
    const squat = await insertTestExercise(db, { slug: "squat" });
    await db.insert(exerciseMuscles).values({ exerciseId: squat.id, muscleId: legs.id, role: "secondary" });

    const result = await findPrimaryExerciseMusclesForMuscles(db, [legs.id]);

    expect(result).toEqual([]);
  });
});

describe("findExercisesByIds", () => {
  it("returns an empty array without querying when given no ids", async () => {
    const result = await findExercisesByIds(db, []);
    expect(result).toEqual([]);
  });

  it("returns only the exercises matching the given ids", async () => {
    const a = await insertTestExercise(db, { slug: "a" });
    await insertTestExercise(db, { slug: "b" });

    const result = await findExercisesByIds(db, [a.id]);

    expect(result.map((e) => e.id)).toEqual([a.id]);
  });
});

describe("findLastPerformedSet", () => {
  it("returns null when the exercise has never been logged", async () => {
    const ex = await insertTestExercise(db);
    const result = await findLastPerformedSet(db, OWNER_USER_ID, ex.id);
    expect(result).toBeNull();
  });

  it("returns the most recently logged non-warmup set's weight and reps", async () => {
    const ex = await insertTestExercise(db);
    const [workout] = await db.insert(workouts).values({ clientId: "w1", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values([
      {
        workoutExerciseId: we!.id,
        setIndex: 0,
        weightKg: 80,
        reps: 8,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date("2026-09-01T10:00:00Z"),
        clientId: "s-old",
      },
      {
        workoutExerciseId: we!.id,
        setIndex: 1,
        weightKg: 100,
        reps: 5,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date("2026-09-05T10:00:00Z"),
        clientId: "s-new",
      },
    ]);

    const result = await findLastPerformedSet(db, OWNER_USER_ID, ex.id);

    expect(result).toEqual({ weightKg: 100, reps: 5 });
  });

  it("excludes warmup sets even if they're the most recent", async () => {
    const ex = await insertTestExercise(db);
    const [workout] = await db.insert(workouts).values({ clientId: "w2", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values([
      {
        workoutExerciseId: we!.id,
        setIndex: 0,
        weightKg: 60,
        reps: 10,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date("2026-09-01T10:00:00Z"),
        clientId: "s-working",
      },
      {
        workoutExerciseId: we!.id,
        setIndex: 1,
        weightKg: 20,
        reps: 12,
        kind: "warmup",
        isWarmup: true,
        loggedAt: new Date("2026-09-05T10:00:00Z"),
        clientId: "s-warmup",
      },
    ]);

    const result = await findLastPerformedSet(db, OWNER_USER_ID, ex.id);

    expect(result).toEqual({ weightKg: 60, reps: 10 });
  });
});
