import { beforeEach, describe, expect, it } from "vitest";
import { exercises, prs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { getPrs } from "./prService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("getPrs", () => {
  it("returns an empty list when no PRs exist yet", async () => {
    const result = await getPrs(db);
    expect(result).toEqual([]);
  });

  it("returns a PR joined to its exercise slug and originating workout", async () => {
    const exercise = await insertTestExercise(db, { slug: "bench-press" });
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "w-1", startedAt: new Date(), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    const [set] = await db
      .insert(sets)
      .values({
        workoutExerciseId: we!.id,
        setIndex: 0,
        weightKg: 100,
        reps: 5,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date(),
        clientId: "s-1",
      })
      .returning();
    await db.insert(prs).values({
      exerciseId: exercise.id,
      kind: "weight",
      value: 100,
      setId: set!.id,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const result = await getPrs(db);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      exerciseSlug: "bench-press",
      kind: "weight",
      value: 100,
      workoutId: workout!.id,
    });
  });

  it("returns workoutId null when the originating set was deleted", async () => {
    const exercise = await insertTestExercise(db);
    await db.insert(prs).values({
      exerciseId: exercise.id,
      kind: "e1rm",
      value: 120,
      setId: null,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const result = await getPrs(db);
    expect(result[0]!.workoutId).toBeNull();
  });

  it("sorts newest-first", async () => {
    const exercise = await insertTestExercise(db);
    await db.insert(prs).values([
      { exerciseId: exercise.id, kind: "weight", value: 80, setId: null, achievedAt: new Date("2026-08-01T00:00:00Z") },
      { exerciseId: exercise.id, kind: "weight", value: 90, setId: null, achievedAt: new Date("2026-09-01T00:00:00Z") },
    ]);

    const result = await getPrs(db);
    expect(result.map((r) => r.value)).toEqual([90, 80]);
  });
});
