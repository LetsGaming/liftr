import { beforeEach, describe, expect, it } from "vitest";
import { prs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../services/testDb.js";
import { findWorkoutWithExercisesAndSets } from "./workoutRepository.js";

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
