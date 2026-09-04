import { beforeEach, describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, prs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../services/testDb.js";
import { findPreviousFinishedWorkout, findPrimaryMuscleSlugsForWorkout, findWorkoutWithExercisesAndSets } from "./workoutRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findWorkoutWithExercisesAndSets", () => {
  it("joins each set's own pr rows, not every pr for the exercise", async () => {
    const ex = await insertTestExercise(db);
    const [workout] = await db.insert(workouts).values({ clientId: "w1", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    const [prSet, plainSet] = await db
      .insert(sets)
      .values([
        { workoutExerciseId: we!.id, setIndex: 0, weightKg: 100, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s1" },
        { workoutExerciseId: we!.id, setIndex: 1, weightKg: 90, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s2" },
      ])
      .returning();

    await db.insert(prs).values({ exerciseId: ex.id, kind: "weight", value: 100, setId: prSet!.id, achievedAt: new Date() });

    const result = await findWorkoutWithExercisesAndSets(db, workout!.id);

    const returnedSets = result!.workoutExercises[0]!.sets;
    const returnedPrSet = returnedSets.find((s) => s.id === prSet!.id)!;
    const returnedPlainSet = returnedSets.find((s) => s.id === plainSet!.id)!;
    expect(returnedPrSet.prs).toHaveLength(1);
    expect(returnedPlainSet.prs).toHaveLength(0);
  });

  it("returns an empty prs array for a set with no PR", async () => {
    const ex = await insertTestExercise(db);
    const [workout] = await db.insert(workouts).values({ clientId: "w2", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values({ workoutExerciseId: we!.id, setIndex: 0, weightKg: 50, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s3" });

    const result = await findWorkoutWithExercisesAndSets(db, workout!.id);

    expect(result!.workoutExercises[0]!.sets[0]!.prs).toEqual([]);
  });
});

async function insertWorkout(overrides: { clientId: string; startedAt: Date; endedAt?: Date | null }) {
  const [row] = await db
    .insert(workouts)
    .values({ clientId: overrides.clientId, startedAt: overrides.startedAt, endedAt: overrides.endedAt ?? null, pausedSeconds: 0 })
    .returning();
  return row!;
}

describe("findPreviousFinishedWorkout", () => {
  it("excludes the workout passed as workoutId, even when it's the most recently finished one", async () => {
    const earlier = await insertWorkout({
      clientId: "w-earlier",
      startedAt: new Date("2026-08-01T10:00:00Z"),
      endedAt: new Date("2026-08-01T11:00:00Z"),
    });
    // The "current" workout — most recent by endedAt, and the one we pass as workoutId.
    const current = await insertWorkout({
      clientId: "w-current",
      startedAt: new Date("2026-09-04T10:00:00Z"),
      endedAt: new Date("2026-09-04T11:00:00Z"),
    });

    const result = await findPreviousFinishedWorkout(db, current.id);

    expect(result?.id).toBe(earlier.id);
  });

  it("returns null when there is no earlier finished workout (first-ever session)", async () => {
    const current = await insertWorkout({
      clientId: "w-only",
      startedAt: new Date("2026-09-04T10:00:00Z"),
      endedAt: new Date("2026-09-04T11:00:00Z"),
    });

    const result = await findPreviousFinishedWorkout(db, current.id);

    expect(result).toBeNull();
  });

  it("does not return an unfinished workout even if it's the most recent by startedAt", async () => {
    const finished = await insertWorkout({
      clientId: "w-finished",
      startedAt: new Date("2026-08-01T10:00:00Z"),
      endedAt: new Date("2026-08-01T11:00:00Z"),
    });
    // Started later than `finished`, but never ended — must not be returned.
    const unfinished = await insertWorkout({
      clientId: "w-unfinished",
      startedAt: new Date("2026-09-03T10:00:00Z"),
      endedAt: null,
    });
    const current = await insertWorkout({
      clientId: "w-current",
      startedAt: new Date("2026-09-04T10:00:00Z"),
      endedAt: new Date("2026-09-04T11:00:00Z"),
    });

    const result = await findPreviousFinishedWorkout(db, current.id);

    expect(result?.id).toBe(finished.id);
    expect(result?.id).not.toBe(unfinished.id);
  });
});

describe("findPrimaryMuscleSlugsForWorkout", () => {
  it("returns only primary-role muscles, scoped to the one workout", async () => {
    const chest = (await db.insert(muscles).values({ slug: "chest", svgRegionKey: "mb-chest" }).returning())[0]!;
    const triceps = (await db.insert(muscles).values({ slug: "triceps", svgRegionKey: "ms-tri" }).returning())[0]!;
    const legs = (await db.insert(muscles).values({ slug: "legs", svgRegionKey: "mb-legs" }).returning())[0]!;

    const bench = await insertTestExercise(db, { slug: "bench-press-wr" });
    await db.insert(exerciseMuscles).values([
      { exerciseId: bench.id, muscleId: chest.id, role: "primary" },
      { exerciseId: bench.id, muscleId: triceps.id, role: "secondary" },
    ]);
    const squat = await insertTestExercise(db, { slug: "squat-wr" });
    await db.insert(exerciseMuscles).values([{ exerciseId: squat.id, muscleId: legs.id, role: "primary" }]);

    const workout = await insertWorkout({ clientId: "w-muscles", startedAt: new Date(), endedAt: new Date() });
    const otherWorkout = await insertWorkout({ clientId: "w-other", startedAt: new Date(), endedAt: new Date() });

    const [we] = await db.insert(workoutExercises).values({ workoutId: workout.id, exerciseId: bench.id, orderIndex: 0 }).returning();
    await db.insert(sets).values({ workoutExerciseId: we!.id, setIndex: 0, weightKg: 60, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-wr-1" });

    // Squat set logged in a *different* workout — must not leak into this workout's result.
    const [weOther] = await db.insert(workoutExercises).values({ workoutId: otherWorkout.id, exerciseId: squat.id, orderIndex: 0 }).returning();
    await db.insert(sets).values({ workoutExerciseId: weOther!.id, setIndex: 0, weightKg: 100, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-wr-2" });

    const result = await findPrimaryMuscleSlugsForWorkout(db, workout.id);

    expect(result.map((r) => r.muscleSlug).sort()).toEqual(["chest"]);
  });
});
