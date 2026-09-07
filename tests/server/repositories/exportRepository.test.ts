import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import {
  findAllBodyweightLogsForExport,
  findAllRunsForExport,
  findAllSetsForExport,
  findAllWorkoutsForExport,
} from "~server/repositories/exportRepository.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findAllWorkoutsForExport", () => {
  it("returns an empty array when there are no workouts", async () => {
    const result = await findAllWorkoutsForExport(db);
    expect(result).toEqual([]);
  });

  it("orders workouts most-recently-started first", async () => {
    await db.insert(workouts).values({ clientId: "w-early", startedAt: new Date("2026-08-01T10:00:00Z"), pausedSeconds: 0 });
    await db.insert(workouts).values({ clientId: "w-late", startedAt: new Date("2026-09-01T10:00:00Z"), pausedSeconds: 0 });

    const result = await findAllWorkoutsForExport(db);

    expect(result.map((r) => r.clientId)).toEqual(["w-late", "w-early"]);
  });
});

describe("findAllSetsForExport", () => {
  it("returns an empty array when there are no sets", async () => {
    const result = await findAllSetsForExport(db);
    expect(result).toEqual([]);
  });

  it("joins in the parent workout id and exercise slug, ordered oldest-logged-first", async () => {
    const ex = await insertTestExercise(db, { slug: "bench-press" });
    const [workout] = await db.insert(workouts).values({ clientId: "w1", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values([
      { workoutExerciseId: we!.id, setIndex: 0, weightKg: 100, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-02T10:00:00Z"), clientId: "s-late" },
      { workoutExerciseId: we!.id, setIndex: 1, weightKg: 90, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-01T10:00:00Z"), clientId: "s-early" },
    ]);

    const result = await findAllSetsForExport(db);

    expect(result.map((r) => r.workoutId)).toEqual([workout!.id, workout!.id]);
    expect(result.every((r) => r.exerciseSlug === "bench-press")).toBe(true);
    expect(result.map((r) => r.weightKg)).toEqual([90, 100]);
  });
});

describe("findAllRunsForExport", () => {
  it("returns an empty array when there are no runs", async () => {
    const result = await findAllRunsForExport(db);
    expect(result).toEqual([]);
  });

  it("orders runs most-recently-started first", async () => {
    await db.insert(runs).values({ source: "manual", startedAt: new Date("2026-08-01T10:00:00Z"), distanceM: 5000, durationS: 1800, clientId: "r-early" });
    await db.insert(runs).values({ source: "manual", startedAt: new Date("2026-09-01T10:00:00Z"), distanceM: 10000, durationS: 3600, clientId: "r-late" });

    const result = await findAllRunsForExport(db);

    expect(result.map((r) => r.clientId)).toEqual(["r-late", "r-early"]);
  });
});

describe("findAllBodyweightLogsForExport", () => {
  it("returns an empty array when there are no logs", async () => {
    const result = await findAllBodyweightLogsForExport(db);
    expect(result).toEqual([]);
  });

  it("orders logs most-recent-date first", async () => {
    await db.insert(bodyweightLogs).values({ date: "2026-08-01", weightKg: 80 });
    await db.insert(bodyweightLogs).values({ date: "2026-09-01", weightKg: 81 });

    const result = await findAllBodyweightLogsForExport(db);

    expect(result.map((r) => r.date)).toEqual(["2026-09-01", "2026-08-01"]);
  });
});
