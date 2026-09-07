import { beforeEach, describe, expect, it } from "vitest";
import { ranks, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import {
  findFinishedWorkoutsPage,
  findRanksByExerciseIds,
  findRecentRunsPage,
  findSetHistoryForExercise,
} from "~server/repositories/historyRepository.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertWorkout(overrides: { clientId: string; startedAt: Date; endedAt?: Date | null }) {
  const [row] = await db
    .insert(workouts)
    .values({ clientId: overrides.clientId, startedAt: overrides.startedAt, endedAt: overrides.endedAt ?? null, pausedSeconds: 0 })
    .returning();
  return row!;
}

describe("findFinishedWorkoutsPage", () => {
  it("excludes unfinished workouts", async () => {
    await insertWorkout({ clientId: "w-unfinished", startedAt: new Date("2026-09-01T10:00:00Z"), endedAt: null });
    const finished = await insertWorkout({ clientId: "w-finished", startedAt: new Date("2026-09-01T09:00:00Z"), endedAt: new Date("2026-09-01T09:30:00Z") });

    const result = await findFinishedWorkoutsPage(db, new Date("2026-09-05T00:00:00Z"), 20);

    expect(result.map((w) => w.id)).toEqual([finished.id]);
  });

  it("excludes workouts started on or after the cursor date", async () => {
    const before = await insertWorkout({ clientId: "w-before", startedAt: new Date("2026-09-01T10:00:00Z"), endedAt: new Date("2026-09-01T11:00:00Z") });
    await insertWorkout({ clientId: "w-at-cursor", startedAt: new Date("2026-09-05T10:00:00Z"), endedAt: new Date("2026-09-05T11:00:00Z") });
    await insertWorkout({ clientId: "w-after", startedAt: new Date("2026-09-06T10:00:00Z"), endedAt: new Date("2026-09-06T11:00:00Z") });

    const result = await findFinishedWorkoutsPage(db, new Date("2026-09-05T10:00:00Z"), 20);

    expect(result.map((w) => w.id)).toEqual([before.id]);
  });

  it("orders results most-recently-started first and respects the limit", async () => {
    const earliest = await insertWorkout({ clientId: "w1", startedAt: new Date("2026-08-01T10:00:00Z"), endedAt: new Date("2026-08-01T11:00:00Z") });
    const middle = await insertWorkout({ clientId: "w2", startedAt: new Date("2026-08-02T10:00:00Z"), endedAt: new Date("2026-08-02T11:00:00Z") });
    const latest = await insertWorkout({ clientId: "w3", startedAt: new Date("2026-08-03T10:00:00Z"), endedAt: new Date("2026-08-03T11:00:00Z") });
    void earliest;

    const result = await findFinishedWorkoutsPage(db, new Date("2026-09-05T00:00:00Z"), 2);

    expect(result.map((w) => w.id)).toEqual([latest.id, middle.id]);
  });

  it("nests workout exercises with their sets and exercise details", async () => {
    const ex = await insertTestExercise(db, { slug: "squat-hist" });
    const workout = await insertWorkout({ clientId: "w-nested", startedAt: new Date("2026-08-01T10:00:00Z"), endedAt: new Date("2026-08-01T11:00:00Z") });
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values({ workoutExerciseId: we!.id, setIndex: 0, weightKg: 100, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-nested" });

    const result = await findFinishedWorkoutsPage(db, new Date("2026-09-05T00:00:00Z"), 20);

    expect(result[0]!.workoutExercises[0]!.exercise.slug).toBe("squat-hist");
    expect(result[0]!.workoutExercises[0]!.sets).toHaveLength(1);
  });
});

describe("findRecentRunsPage", () => {
  async function insertRun(overrides: { clientId: string; startedAt: Date }) {
    const [row] = await db
      .insert(runs)
      .values({ source: "manual", startedAt: overrides.startedAt, distanceM: 5000, durationS: 1800, clientId: overrides.clientId })
      .returning();
    return row!;
  }

  it("excludes runs started on or after the cursor date", async () => {
    const before = await insertRun({ clientId: "r-before", startedAt: new Date("2026-09-01T10:00:00Z") });
    await insertRun({ clientId: "r-after", startedAt: new Date("2026-09-06T10:00:00Z") });

    const result = await findRecentRunsPage(db, new Date("2026-09-05T00:00:00Z"), 20);

    expect(result.map((r) => r.id)).toEqual([before.id]);
  });

  it("orders results most-recently-started first and respects the limit", async () => {
    const earliest = await insertRun({ clientId: "r1", startedAt: new Date("2026-08-01T10:00:00Z") });
    const latest = await insertRun({ clientId: "r2", startedAt: new Date("2026-08-02T10:00:00Z") });
    void earliest;

    const result = await findRecentRunsPage(db, new Date("2026-09-05T00:00:00Z"), 1);

    expect(result.map((r) => r.id)).toEqual([latest.id]);
  });
});

describe("findRanksByExerciseIds", () => {
  it("returns an empty array without querying when given no ids", async () => {
    const result = await findRanksByExerciseIds(db, []);
    expect(result).toEqual([]);
  });

  it("returns only ranks for the requested exercise ids", async () => {
    const ex1 = await insertTestExercise(db, { slug: "rank-ex-1" });
    const ex2 = await insertTestExercise(db, { slug: "rank-ex-2" });
    const ex3 = await insertTestExercise(db, { slug: "rank-ex-3" });
    await db.insert(ranks).values([
      { exerciseId: ex1.id, tier: "initiate", division: 5, lp: 10, e1rm: 50, trust: "real", nextTargetWeightKg: null, nextTargetReps: null, computedAt: new Date() },
      { exerciseId: ex2.id, tier: "apprentice", division: 4, lp: 20, e1rm: 60, trust: "real", nextTargetWeightKg: null, nextTargetReps: null, computedAt: new Date() },
      { exerciseId: ex3.id, tier: "trainee", division: 3, lp: 30, e1rm: 70, trust: "real", nextTargetWeightKg: null, nextTargetReps: null, computedAt: new Date() },
    ]);

    const result = await findRanksByExerciseIds(db, [ex1.id, ex3.id]);

    expect(result.map((r) => r.exerciseId).sort()).toEqual([ex1.id, ex3.id].sort());
  });
});

describe("findSetHistoryForExercise", () => {
  it("returns only sets for the given exercise, most-recently-logged first", async () => {
    const ex = await insertTestExercise(db, { slug: "history-ex" });
    const otherEx = await insertTestExercise(db, { slug: "other-ex" });
    const [workout] = await db.insert(workouts).values({ clientId: "w-sh", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    const [otherWe] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: otherEx.id, orderIndex: 1 }).returning();

    await db.insert(sets).values([
      { workoutExerciseId: we!.id, setIndex: 0, weightKg: 90, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-01T10:00:00Z"), clientId: "s-old" },
      { workoutExerciseId: we!.id, setIndex: 1, weightKg: 95, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-02T10:00:00Z"), clientId: "s-new" },
      { workoutExerciseId: otherWe!.id, setIndex: 0, weightKg: 50, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-03T10:00:00Z"), clientId: "s-other" },
    ]);

    const result = await findSetHistoryForExercise(db, ex.id);

    expect(result.map((r) => r.weightKg)).toEqual([95, 90]);
  });

  it("respects the given limit", async () => {
    const ex = await insertTestExercise(db, { slug: "history-ex-limit" });
    const [workout] = await db.insert(workouts).values({ clientId: "w-sh2", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values([
      { workoutExerciseId: we!.id, setIndex: 0, weightKg: 80, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-01T10:00:00Z"), clientId: "s1" },
      { workoutExerciseId: we!.id, setIndex: 1, weightKg: 82, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-02T10:00:00Z"), clientId: "s2" },
    ]);

    const result = await findSetHistoryForExercise(db, ex.id, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.weightKg).toBe(82);
  });
});
