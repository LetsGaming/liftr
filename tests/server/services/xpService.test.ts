import { beforeEach, describe, expect, it } from "vitest";
import { computeLevel } from "@liftr/shared";
import { OWNER_USER_ID, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";
import { getXpSummary } from "~server/services/xpService.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("getXpSummary", () => {
  it("returns zero XP and level 0 with no workouts logged", async () => {
    const result = await getXpSummary(db, OWNER_USER_ID);
    expect(result.totalXp).toBe(0);
    expect(result.level).toBe(0);
  });

  it("adds the finished workout's consistency/variety bonuses on top of the per-set XP total", async () => {
    const exercise = await insertTestExercise(db);
    const [workout] = await db
      .insert(workouts)
      .values({
        clientId: "w-bonus",
        startedAt: new Date("2026-09-01T10:00:00Z"),
        endedAt: new Date("2026-09-01T11:00:00Z"),
        pausedSeconds: 0,
        // No exercise rank exists for this exercise, so tier is null (multiplier 1); this is the
        // only set ever logged, so repeat-decay occurrence is 1 (multiplier 1) and
        // plausibilityMultiplier defaults to 1. computeSetXp therefore reduces to
        // BODYWEIGHT_NOMINAL_LOAD_KG (30) * reps (10) = 300, regardless of the weight typed here.
        consistencyBonusXp: 850,
        varietyBonusXp: 1500,
      })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values({
      workoutExerciseId: we!.id,
      setIndex: 0,
      weightKg: 999999, // arbitrary/absurd weight — must not affect XP magnitude at all
      reps: 10,
      kind: "normal",
      isWarmup: false,
      loggedAt: new Date("2026-09-01T10:05:00Z"),
      clientId: "s-bonus",
    });

    const result = await getXpSummary(db, OWNER_USER_ID);

    // per-set XP (300) + consistencyBonusXp (850) + varietyBonusXp (1500) = 2650
    const expectedTotalXp = 2650;
    expect(result.totalXp).toBe(expectedTotalXp);
    expect(result.level).toBe(computeLevel(expectedTotalXp).level);
  });

  it("treats an unfinished workout's null bonus columns as contributing 0", async () => {
    const exercise = await insertTestExercise(db);
    const [workout] = await db
      .insert(workouts)
      .values({
        clientId: "w-unfinished",
        startedAt: new Date("2026-09-02T10:00:00Z"),
        pausedSeconds: 0,
      })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values({
      workoutExerciseId: we!.id,
      setIndex: 0,
      weightKg: 50,
      reps: 5,
      kind: "normal",
      isWarmup: false,
      loggedAt: new Date("2026-09-02T10:05:00Z"),
      clientId: "s-unfinished",
    });

    const result = await getXpSummary(db, OWNER_USER_ID);

    // per-set XP only: BODYWEIGHT_NOMINAL_LOAD_KG (30) * reps (5) = 150; no bonus contribution
    // since the workout never finished (endedAt is null).
    expect(result.totalXp).toBe(150);
  });

  it("folds run XP into totalXp, mapping a manual run's null plausibilityMultiplier to 1 (full credit) per Ruling 5", async () => {
    // GPS-tracked run with a real, sub-1 plausibility multiplier.
    await db.insert(runs).values({
      userId: OWNER_USER_ID,
      source: "gpx",
      name: null,
      startedAt: new Date("2026-09-01T10:00:00Z"),
      distanceM: 5000, // 5km * 60 XP/km = 300 base XP; first occurrence of this bucket => multiplier 1
      durationS: 1500,
      avgPaceSPerKm: 300,
      plausibilityMultiplier: 0.5,
      clientId: "xp-run-gps",
    });
    // Manual run — plausibilityMultiplier is null in the DB (the gate never runs against manual
    // entries). This must map to a multiplier of 1 (full credit), NOT 0.
    await db.insert(runs).values({
      userId: OWNER_USER_ID,
      source: "manual",
      name: null,
      startedAt: new Date("2026-09-03T10:00:00Z"),
      distanceM: 10000, // distinct distance bucket from the 5km run above => also first occurrence
      durationS: 3000,
      avgPaceSPerKm: 300,
      plausibilityMultiplier: null,
      clientId: "xp-run-manual",
    });

    const result = await getXpSummary(db, OWNER_USER_ID);

    // GPS run: (5000/1000)*60 * 1 (1st occurrence) * 0.5 (plausibility) = 150
    // Manual run: (10000/1000)*60 * 1 (1st occurrence) * 1 (null -> 1) = 600
    // No workouts logged, so no set/session-bonus XP contributes here.
    expect(result.totalXp).toBe(750);
  });
});
