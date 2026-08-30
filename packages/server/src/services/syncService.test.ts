import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { applySyncBatch, type SyncItem } from "./syncService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;
let exerciseId: string;

beforeEach(async () => {
  db = createTestDb();
  exerciseId = (await insertTestExercise(db)).id;
});

/** A minimal, valid start_workout item — tests override only what they care about. */
function startWorkoutItem(overrides: Partial<SyncItem & { type: "start_workout" }> = {}): SyncItem {
  return {
    clientId: "client-start-1",
    type: "start_workout",
    payload: {
      id: "workout-1",
      startedAt: new Date("2026-01-01T10:00:00Z"),
      exercises: [{ id: "we-1", exerciseId, orderIndex: 0 }],
    },
    ...overrides,
  } as SyncItem;
}

describe("applySyncBatch — start_workout", () => {
  it("creates a workout and its exercises", async () => {
    const [result] = await applySyncBatch(db, [startWorkoutItem()]);
    expect(result).toMatchObject({ clientId: "client-start-1", status: "created", serverId: "workout-1" });
  });

  it("is idempotent on the client-generated workout id — replaying the same batch is a no-op", async () => {
    await applySyncBatch(db, [startWorkoutItem()]);
    const [result] = await applySyncBatch(db, [startWorkoutItem()]);
    expect(result).toMatchObject({ status: "already_synced", serverId: "workout-1" });
  });
});

describe("applySyncBatch — log_set", () => {
  async function withStartedWorkout() {
    await applySyncBatch(db, [startWorkoutItem()]);
  }

  function logSetItem(payloadOverrides: Record<string, unknown> = {}, clientId = "client-set-1"): SyncItem {
    return {
      clientId,
      type: "log_set",
      payload: {
        workoutExerciseId: "we-1",
        setIndex: 0,
        weightKg: 60,
        reps: 8,
        kind: "normal",
        loggedAt: new Date("2026-01-01T10:05:00Z"),
        ...payloadOverrides,
      },
    } as SyncItem;
  }

  it("creates a set for a real workout_exercise", async () => {
    await withStartedWorkout();
    const [result] = await applySyncBatch(db, [logSetItem()]);
    expect(result!.status).toBe("created");
  });

  it("is idempotent on clientId — a retried flush never duplicates a set", async () => {
    await withStartedWorkout();
    await applySyncBatch(db, [logSetItem()]);
    const [result] = await applySyncBatch(db, [logSetItem()]);
    expect(result!.status).toBe("already_synced");
  });

  it("rejects a set referencing a workout_exercise that doesn't exist (stale/bad queue entry)", async () => {
    const [result] = await applySyncBatch(db, [logSetItem({ workoutExerciseId: "no-such-id" })]);
    expect(result).toMatchObject({ status: "error", error: "unknown_workout_exercise" });
  });

  it("rejects an implausible weight (defense-in-depth against a request that skipped the client's own clamp)", async () => {
    await withStartedWorkout();
    const [result] = await applySyncBatch(db, [logSetItem({ weightKg: 5000 })]);
    expect(result).toMatchObject({ status: "error", error: "implausible_set" });
  });

  it("rejects implausible reps the same way", async () => {
    await withStartedWorkout();
    const [result] = await applySyncBatch(db, [logSetItem({ reps: 999 })]);
    expect(result).toMatchObject({ status: "error", error: "implausible_set" });
  });

  it("a rejected item doesn't fail its siblings in the same batch", async () => {
    await withStartedWorkout();
    const results = await applySyncBatch(db, [
      logSetItem({ weightKg: 5000 }, "bad"),
      logSetItem({}, "good"),
    ]);
    expect(results.find((r) => r.clientId === "bad")?.status).toBe("error");
    expect(results.find((r) => r.clientId === "good")?.status).toBe("created");
  });
});

describe("applySyncBatch — finish_workout", () => {
  it("marks the workout ended and credits the day's streak", async () => {
    await applySyncBatch(db, [startWorkoutItem()]);
    const [result] = await applySyncBatch(db, [
      {
        clientId: "client-finish-1",
        type: "finish_workout",
        payload: { workoutId: "workout-1", endedAt: new Date("2026-01-01T11:00:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);
    expect(result!.status).toBe("created");
    // no standards seeded for the test exercise, so no rank verdicts — an empty array, not a crash
    expect(result!.ranks).toEqual([]);
  });

  it("is idempotent — finishing an already-finished workout returns already_synced", async () => {
    await applySyncBatch(db, [startWorkoutItem()]);
    const finishItem: SyncItem = {
      clientId: "client-finish-1",
      type: "finish_workout",
      payload: { workoutId: "workout-1", endedAt: new Date("2026-01-01T11:00:00Z"), pausedSeconds: 0 },
    } as SyncItem;
    await applySyncBatch(db, [finishItem]);
    const [result] = await applySyncBatch(db, [finishItem]);
    expect(result!.status).toBe("already_synced");
  });
});

describe("applySyncBatch — add_exercise", () => {
  it("creates a mid-session workout_exercise and is idempotent on its id", async () => {
    await applySyncBatch(db, [startWorkoutItem()]);
    const item: SyncItem = {
      clientId: "client-add-1",
      type: "add_exercise",
      payload: { id: "we-2", workoutId: "workout-1", exerciseId, orderIndex: 1 },
    } as SyncItem;
    const [first] = await applySyncBatch(db, [item]);
    expect(first!.status).toBe("created");
    const [second] = await applySyncBatch(db, [item]);
    expect(second!.status).toBe("already_synced");
  });
});
