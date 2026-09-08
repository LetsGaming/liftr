import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";
import { findSetByClientId, insertSet, type NewSet } from "~server/repositories/setRepository.js";

let db: LiftrDb;
let workoutExerciseId: string;

beforeEach(async () => {
  db = createTestDb();
  const ex = await insertTestExercise(db);
  const [workout] = await db.insert(workouts).values({ clientId: "w1", startedAt: new Date(), pausedSeconds: 0 }).returning();
  const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
  workoutExerciseId = we!.id;
});

function newSet(overrides: Partial<NewSet> = {}): NewSet {
  return {
    workoutExerciseId,
    setIndex: 0,
    weightKg: 60,
    reps: 8,
    kind: "normal",
    isWarmup: false,
    loggedAt: new Date("2026-09-01T10:00:00Z"),
    clientId: `s-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

describe("insertSet", () => {
  it("creates and returns the new set row", async () => {
    const row = await insertSet(db, OWNER_USER_ID, newSet({ clientId: "s1", weightKg: 100, reps: 5 }));

    expect(row.clientId).toBe("s1");
    expect(row.weightKg).toBe(100);
    expect(row.reps).toBe(5);
    expect(row.workoutExerciseId).toBe(workoutExerciseId);
  });

  it("allows a null weightKg for bodyweight sets", async () => {
    const row = await insertSet(db, OWNER_USER_ID, newSet({ clientId: "s-bw", weightKg: null }));
    expect(row.weightKg).toBeNull();
  });
});

describe("findSetByClientId", () => {
  it("returns the set matching the given clientId", async () => {
    await insertSet(db, OWNER_USER_ID, newSet({ clientId: "s-find-me" }));

    const result = await findSetByClientId(db, OWNER_USER_ID, "s-find-me");

    expect(result?.clientId).toBe("s-find-me");
  });

  it("returns undefined when no set has that clientId", async () => {
    const result = await findSetByClientId(db, OWNER_USER_ID, "nonexistent-client-id");
    expect(result).toBeUndefined();
  });
});
