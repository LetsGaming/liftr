import { beforeEach, describe, expect, it } from "vitest";
import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "./testDb.js";
import { getHistoryPage } from "./historyService.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("getHistoryPage", () => {
  it("adds the finished workout's consistency/variety bonuses on top of the per-set XP total, matching getXpSummary's figure for the same session", async () => {
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

    const page = await getHistoryPage(db, undefined, 20);

    const item = page.items.find((i) => i.id === workout!.id);
    // per-set XP (300) + consistencyBonusXp (850) + varietyBonusXp (1500) = 2650 — must equal
    // exactly what getXpSummary would report for this same finished session (see
    // xpService.test.ts's identically-shaped fixture), or the history feed and the Finish
    // Sequence would silently disagree about the same past session's XP.
    expect(item?.meta.xp).toBe(2650);
  });

  it("treats a workout's null bonus columns (e.g. finished before this feature existed) as contributing 0, without throwing or producing NaN", async () => {
    const exercise = await insertTestExercise(db);
    const [workout] = await db
      .insert(workouts)
      .values({
        clientId: "w-null-bonus",
        startedAt: new Date("2026-09-02T10:00:00Z"),
        endedAt: new Date("2026-09-02T11:00:00Z"),
        pausedSeconds: 0,
        // consistencyBonusXp/varietyBonusXp intentionally omitted — both default to null.
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
      clientId: "s-null-bonus",
    });

    const page = await getHistoryPage(db, undefined, 20);

    const item = page.items.find((i) => i.id === workout!.id);
    // per-set XP only: BODYWEIGHT_NOMINAL_LOAD_KG (30) * reps (5) = 150; null bonus columns must
    // be treated as 0, not propagate as NaN.
    expect(item?.meta.xp).toBe(150);
    expect(Number.isNaN(item?.meta.xp)).toBe(false);
  });
});
