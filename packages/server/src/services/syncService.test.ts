import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { computeConsistencyBonus, computeTotalXp, computeVarietyBonus, type Tier } from "@liftr/shared";
import { exerciseMuscles, muscles, ranks, standards, workouts, type LiftrDb } from "@liftr/db";
import { applySyncBatch, type SyncItem } from "./syncService.js";
import { getXpSummary } from "./xpService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

/** Inserts a muscle row (or reuses one by slug) and links it as a primary-role muscle of the given
 *  exercise — the minimal fixture the variety-bonus tests need, since `insertTestExercise` alone
 *  doesn't seed any `exercise_muscles` rows. */
async function linkPrimaryMuscle(db: LiftrDb, exerciseId: string, slug: string) {
  const [muscle] = await db
    .insert(muscles)
    .values({ slug, svgRegionKey: slug })
    .onConflictDoNothing()
    .returning();
  const muscleId = muscle?.id ?? (await db.query.muscles.findFirst({ where: eq(muscles.slug, slug) }))!.id;
  await db.insert(exerciseMuscles).values({ exerciseId, muscleId, role: "primary" });
}

/** Matches rankService.test.ts's own `seedStandards` helper — a minimal load_ratio standards
 *  ladder so `recomputeRankForExercise` (called internally by finish_workout) actually produces
 *  a verdict instead of bailing out with "no standards modeled". */
async function seedStandards(db: LiftrDb, exerciseId: string) {
  await db.insert(standards).values([
    { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 2, threshold: 0.7, trust: "real" },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust: "real" },
  ]);
}

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

  it("persists workout-level notes sent in the finish_workout payload (Task 2)", async () => {
    await applySyncBatch(db, [startWorkoutItem()]);
    await applySyncBatch(db, [
      {
        clientId: "client-finish-notes-1",
        type: "finish_workout",
        payload: {
          workoutId: "workout-1",
          endedAt: new Date("2026-01-01T11:00:00Z"),
          pausedSeconds: 0,
          notes: "leg day, felt strong",
        },
      } as SyncItem,
    ]);

    const workoutRow = await db.query.workouts.findFirst({ where: eq(workouts.id, "workout-1") });
    expect(workoutRow!.notes).toBe("leg day, felt strong");
  });

  it("stores notes as null when the finish_workout payload omits it", async () => {
    await applySyncBatch(db, [startWorkoutItem()]);
    await applySyncBatch(db, [
      {
        clientId: "client-finish-notes-2",
        type: "finish_workout",
        payload: { workoutId: "workout-1", endedAt: new Date("2026-01-01T11:00:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    const workoutRow = await db.query.workouts.findFirst({ where: eq(workouts.id, "workout-1") });
    expect(workoutRow!.notes).toBeNull();
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

  function logSetItemAt(loggedAt: Date, clientId: string): SyncItem {
    return {
      clientId,
      type: "log_set",
      payload: {
        workoutExerciseId: "we-1",
        setIndex: 0,
        weightKg: 60,
        reps: 8,
        kind: "normal",
        loggedAt,
      },
    } as SyncItem;
  }

  it("flags a workout with an unrealistic sets-per-minute pace and discounts its rank verdicts", async () => {
    await seedStandards(db, exerciseId);
    await applySyncBatch(db, [startWorkoutItem()]);
    const startedAt = new Date("2026-01-01T10:00:00Z");
    // 20 sets crammed into the ~60-second window between startedAt and endedAt below — no human
    // logs 20 sets a minute apart, so this should trip the pace heuristic (severity maxes out at
    // or below PACE_MAX_SEVERITY_THRESHOLD_S = 6s/set; here it's 3s/set).
    const setItems: SyncItem[] = Array.from({ length: 20 }, (_, i) =>
      logSetItemAt(new Date(startedAt.getTime() + i * 3000), `client-pace-set-${i}`),
    );
    await applySyncBatch(db, setItems);

    const [result] = await applySyncBatch(db, [
      {
        clientId: "finish-1",
        type: "finish_workout",
        payload: { workoutId: "workout-1", endedAt: new Date(startedAt.getTime() + 60_000), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    expect(result!.status).toBe("created");
    expect(result!.ranks?.length).toBeGreaterThan(0);
    expect(result!.ranks?.some((r) => r.plausibilityReason === "pace")).toBe(true);
  });

  it("persists workouts.plausibility_multiplier and getXpSummary reflects a discounted XP total end-to-end", async () => {
    // Full-chain integration test (finding: only pure unit tests + verdict.plausibilityReason
    // coverage existed before this) — finish a flagged workout, confirm the multiplier is
    // actually persisted on the `workouts` row (not just returned in the verdict), then confirm
    // getXpSummary actually returns a discounted total for those sets, not the full undiscounted
    // amount a normal, unflagged session of the exact same sets would produce.
    await seedStandards(db, exerciseId);
    await applySyncBatch(db, [startWorkoutItem()]);
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const setLoggedAts = Array.from({ length: 20 }, (_, i) => new Date(startedAt.getTime() + i * 3000));
    const setItems: SyncItem[] = setLoggedAts.map((loggedAt, i) => logSetItemAt(loggedAt, `client-xp-set-${i}`));
    await applySyncBatch(db, setItems);

    const [result] = await applySyncBatch(db, [
      {
        clientId: "finish-xp-1",
        type: "finish_workout",
        payload: { workoutId: "workout-1", endedAt: new Date(startedAt.getTime() + 60_000), pausedSeconds: 0 },
      } as SyncItem,
    ]);
    expect(result!.status).toBe("created");
    expect(result!.ranks?.some((r) => r.plausibilityReason === "pace")).toBe(true);

    // 1. The multiplier is actually persisted on the workout row, not just returned in the verdict.
    const workoutRow = await db.query.workouts.findFirst({ where: eq(workouts.id, "workout-1") });
    expect(workoutRow!.plausibilityMultiplier).not.toBeNull();
    expect(workoutRow!.plausibilityMultiplier!).toBeLessThan(1);

    // 2. getXpSummary's total for these sets is measurably lower than what an identical, fully
    // plausible (multiplier 1) session of the same sets would produce — computed directly via
    // the same computeTotalXp @liftr/shared uses internally, forcing plausibilityMultiplier to 1,
    // as the "what an unflagged session would have earned" baseline.
    const rankRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, exerciseId) });
    const tier = (rankRow?.tier ?? null) as Tier | null;
    const undiscountedXp = computeTotalXp(
      setLoggedAts.map((loggedAt) => ({
        exerciseId,
        weightKg: 60,
        reps: 8,
        tier,
        loggedAt: loggedAt.getTime(),
        plausibilityMultiplier: 1,
      })),
    );

    const summary = await getXpSummary(db);
    expect(summary.totalXp).toBeLessThan(Math.round(undiscountedXp));
  });

  it("does not flag a normally-paced workout", async () => {
    await seedStandards(db, exerciseId);
    await applySyncBatch(db, [startWorkoutItem()]);
    const startedAt = new Date("2026-01-01T10:00:00Z");
    // 5 sets spread across 30 minutes — a realistic pace (well above the 15s/set fine threshold).
    const setItems: SyncItem[] = Array.from({ length: 5 }, (_, i) =>
      logSetItemAt(new Date(startedAt.getTime() + i * 6 * 60_000), `client-normal-set-${i}`),
    );
    await applySyncBatch(db, setItems);

    const [result] = await applySyncBatch(db, [
      {
        clientId: "finish-2",
        type: "finish_workout",
        payload: { workoutId: "workout-1", endedAt: new Date(startedAt.getTime() + 30 * 60_000), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    expect(result!.status).toBe("created");
    expect(result!.ranks?.length).toBeGreaterThan(0);
    expect(result!.ranks?.every((r) => r.plausibilityReason == null)).toBe(true);
  });

  it("triggers the improbable_jump flag for a bodyweight exercise using bodyweight-adjusted ratios", async () => {
    // isBodyweight + leverage 1 means the "load" for e1RM purposes is bodyweight + added weight,
    // not just the added weight alone. Fallback bodyweight is 75kg (no bodyweightLogs seeded).
    const bwExerciseId = (await insertTestExercise(db, { slug: "bw-exercise", isBodyweight: true, bodyweightLeverage: 1 })).id;
    await db.insert(standards).values([
      { exerciseId: bwExerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
      { exerciseId: bwExerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 2, threshold: 0.8, trust: "real" },
      { exerciseId: bwExerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.0, trust: "real" },
    ]);

    // Session 1: bodyweight-only set (no added weight) establishes a peak ratio of ~1.167
    // (e1RM(75kg, 5 reps) / 75kg bodyweight).
    await applySyncBatch(db, [
      {
        clientId: "start-bw-1",
        type: "start_workout",
        payload: { id: "workout-bw-1", startedAt: new Date("2026-01-01T10:00:00Z"), exercises: [{ id: "we-bw-1", exerciseId: bwExerciseId, orderIndex: 0 }] },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "set-bw-1",
        type: "log_set",
        payload: { workoutExerciseId: "we-bw-1", setIndex: 0, weightKg: 0, reps: 5, kind: "normal", loggedAt: new Date("2026-01-01T10:05:00Z") },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "finish-bw-1",
        type: "finish_workout",
        payload: { workoutId: "workout-bw-1", endedAt: new Date("2026-01-01T10:06:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    // Session 2: a heavily-weighted set. With bodyweight-adjusted load (75kg body + 100kg added =
    // 175kg), the e1RM-ratio jump is ~1.33x above the stored peak ratio, well past the jump
    // heuristic's severity ceiling. Using raw added weight alone (the pre-fix bug: 100kg / 75kg
    // bodyweight ~= 1.33 vs. peak ratio ~1.167, only a ~0.14 fractional jump) would NOT have
    // tripped this check — the bodyweight-adjusted math is what makes this exercise's real jump
    // detectable at all.
    await applySyncBatch(db, [
      {
        clientId: "start-bw-2",
        type: "start_workout",
        payload: { id: "workout-bw-2", startedAt: new Date("2026-01-02T10:00:00Z"), exercises: [{ id: "we-bw-2", exerciseId: bwExerciseId, orderIndex: 0 }] },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "set-bw-2",
        type: "log_set",
        payload: { workoutExerciseId: "we-bw-2", setIndex: 0, weightKg: 100, reps: 5, kind: "normal", loggedAt: new Date("2026-01-02T10:05:00Z") },
      } as SyncItem,
    ]);
    const [result] = await applySyncBatch(db, [
      {
        clientId: "finish-bw-2",
        type: "finish_workout",
        payload: { workoutId: "workout-bw-2", endedAt: new Date("2026-01-02T10:06:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    expect(result!.status).toBe("created");
    expect(result!.ranks?.some((r) => r.plausibilityReason === "improbable_jump")).toBe(true);
  });

  it("compares rep counts (not weightKg) for a metric===\"reps\" exercise, so an unrelated weightKg value doesn't false-positive a jump", async () => {
    const repsExerciseId = (await insertTestExercise(db, { slug: "reps-exercise" })).id;
    await db.insert(standards).values([
      { exerciseId: repsExerciseId, sex: "male", metric: "reps", tier: "apprentice", division: 3, threshold: 5, trust: "real" },
      { exerciseId: repsExerciseId, sex: "male", metric: "reps", tier: "athlete", division: 3, threshold: 15, trust: "real" },
    ]);

    // Session 1 establishes a peak: rankService.ts stores the rep count itself (8) as `peakE1rm`
    // for a reps-metric exercise — it is not an e1RM at all.
    await applySyncBatch(db, [
      {
        clientId: "start-reps-1",
        type: "start_workout",
        payload: { id: "workout-reps-1", startedAt: new Date("2026-01-01T10:00:00Z"), exercises: [{ id: "we-reps-1", exerciseId: repsExerciseId, orderIndex: 0 }] },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "set-reps-1",
        type: "log_set",
        payload: { workoutExerciseId: "we-reps-1", setIndex: 0, weightKg: null, reps: 8, kind: "normal", loggedAt: new Date("2026-01-01T10:05:00Z") },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "finish-reps-1",
        type: "finish_workout",
        payload: { workoutId: "workout-reps-1", endedAt: new Date("2026-01-01T10:06:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    // Session 2's set happens to carry a large `weightKg` value even though this exercise is
    // reps-metric. An older version of this check would have built `sessionBestRatio` from that
    // raw weight (100 / 75kg bodyweight ~= 1.33) and compared it against peakE1rm/bodyweight
    // (8 / 75 ~= 0.107) as if both were load ratios — a huge, spurious "jump". The engagement-
    // audit-v3 Phase 3 fix instead compares rep count directly (session-best reps vs. stored-peak
    // reps), ignoring `weightKg` for a reps-metric exercise entirely — same rep count (8) both
    // sessions here, so this correctly reports no jump even with a wildly different weightKg.
    await applySyncBatch(db, [
      {
        clientId: "start-reps-2",
        type: "start_workout",
        payload: { id: "workout-reps-2", startedAt: new Date("2026-01-02T10:00:00Z"), exercises: [{ id: "we-reps-2", exerciseId: repsExerciseId, orderIndex: 0 }] },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "set-reps-2",
        type: "log_set",
        payload: { workoutExerciseId: "we-reps-2", setIndex: 0, weightKg: 100, reps: 8, kind: "normal", loggedAt: new Date("2026-01-02T10:05:00Z") },
      } as SyncItem,
    ]);
    const [result] = await applySyncBatch(db, [
      {
        clientId: "finish-reps-2",
        type: "finish_workout",
        payload: { workoutId: "workout-reps-2", endedAt: new Date("2026-01-02T10:06:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    expect(result!.status).toBe("created");
    expect(result!.ranks?.every((r) => r.plausibilityReason == null)).toBe(true);
  });

  it("flags improbable_jump for a metric===\"reps\" exercise on an implausible rep-count spike (Phase 3 gap fix)", async () => {
    // Before engagement-audit-v3 Phase 3, every reps-metric exercise (pull-ups, push-ups, etc.)
    // was passed null sessionBestRatio/storedPeakRatio/apexThreshold, so the jump/ceiling
    // heuristics never ran for it at all — a single suspiciously large rep count would sail
    // through undetected as long as the rest of the session's pace looked normal. This test
    // exercises the fix: rep counts are compared the same way load ratios are for a load_ratio
    // exercise.
    const repsExerciseId = (await insertTestExercise(db, { slug: "reps-jump-exercise" })).id;
    await db.insert(standards).values([
      { exerciseId: repsExerciseId, sex: "male", metric: "reps", tier: "apprentice", division: 3, threshold: 5, trust: "real" },
      { exerciseId: repsExerciseId, sex: "male", metric: "reps", tier: "athlete", division: 3, threshold: 15, trust: "real" },
      { exerciseId: repsExerciseId, sex: "male", metric: "reps", tier: "apex", division: 1, threshold: 40, trust: "real" },
    ]);

    // Session 1 establishes a peak of 8 reps.
    await applySyncBatch(db, [
      {
        clientId: "start-repjump-1",
        type: "start_workout",
        payload: { id: "workout-repjump-1", startedAt: new Date("2026-01-01T10:00:00Z"), exercises: [{ id: "we-repjump-1", exerciseId: repsExerciseId, orderIndex: 0 }] },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "set-repjump-1",
        type: "log_set",
        payload: { workoutExerciseId: "we-repjump-1", setIndex: 0, weightKg: null, reps: 8, kind: "normal", loggedAt: new Date("2026-01-01T10:05:00Z") },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "finish-repjump-1",
        type: "finish_workout",
        payload: { workoutId: "workout-repjump-1", endedAt: new Date("2026-01-01T10:06:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    // Session 2: a single set at 25 reps — a >200% jump over the 8-rep stored peak, with an
    // otherwise unremarkable single-set session (no pace red flag).
    await applySyncBatch(db, [
      {
        clientId: "start-repjump-2",
        type: "start_workout",
        payload: { id: "workout-repjump-2", startedAt: new Date("2026-01-02T10:00:00Z"), exercises: [{ id: "we-repjump-2", exerciseId: repsExerciseId, orderIndex: 0 }] },
      } as SyncItem,
    ]);
    await applySyncBatch(db, [
      {
        clientId: "set-repjump-2",
        type: "log_set",
        payload: { workoutExerciseId: "we-repjump-2", setIndex: 0, weightKg: null, reps: 25, kind: "normal", loggedAt: new Date("2026-01-02T10:05:00Z") },
      } as SyncItem,
    ]);
    const [result] = await applySyncBatch(db, [
      {
        clientId: "finish-repjump-2",
        type: "finish_workout",
        payload: { workoutId: "workout-repjump-2", endedAt: new Date("2026-01-02T10:06:00Z"), pausedSeconds: 0 },
      } as SyncItem,
    ]);

    expect(result!.status).toBe("created");
    expect(result!.ranks?.some((r) => r.plausibilityReason === "improbable_jump")).toBe(true);
  });
});

describe("applySyncBatch — finish_workout consistency/variety bonuses", () => {
  function startItem(id: string, exId: string, startedAt: Date, clientId: string): SyncItem {
    return {
      clientId,
      type: "start_workout",
      payload: { id, startedAt, exercises: [{ id: `${id}-we`, exerciseId: exId, orderIndex: 0 }] },
    } as SyncItem;
  }

  function setItem(workoutExerciseId: string, loggedAt: Date, clientId: string): SyncItem {
    return {
      clientId,
      type: "log_set",
      payload: { workoutExerciseId, setIndex: 0, weightKg: 60, reps: 8, kind: "normal", loggedAt },
    } as SyncItem;
  }

  function finishItem(workoutId: string, endedAt: Date, clientId: string): SyncItem {
    return { clientId, type: "finish_workout", payload: { workoutId, endedAt, pausedSeconds: 0 } } as SyncItem;
  }

  it("a first-ever session gets the full variety bonus (all its own muscles are 'new') and a non-zero consistency bonus", async () => {
    await linkPrimaryMuscle(db, exerciseId, "shoulders");
    const day1 = new Date("2026-01-01T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-1", exerciseId, day1, "s1")]);
    await applySyncBatch(db, [setItem("workout-1-we", day1, "set1")]);
    const [result] = await applySyncBatch(db, [finishItem("workout-1", new Date("2026-01-01T11:00:00Z"), "f1")]);

    expect(result!.status).toBe("created");
    expect(result!.newMuscleSlugs).toEqual(["shoulders"]);
    expect(result!.varietyBonusXp).toBe(computeVarietyBonus(1));
    expect(result!.consistencyBonusXp).toBe(computeConsistencyBonus(1));
    expect(result!.consistencyBonusXp).toBeGreaterThan(0);
  });

  it("a session whose muscles fully overlap the immediately-preceding session scores 0 variety, without affecting its own consistency bonus", async () => {
    await linkPrimaryMuscle(db, exerciseId, "shoulders");
    const day1 = new Date("2026-01-01T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-1", exerciseId, day1, "s1")]);
    await applySyncBatch(db, [setItem("workout-1-we", day1, "set1")]);
    await applySyncBatch(db, [finishItem("workout-1", new Date("2026-01-01T11:00:00Z"), "f1")]);

    const day2 = new Date("2026-01-02T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-2", exerciseId, day2, "s2")]);
    await applySyncBatch(db, [setItem("workout-2-we", day2, "set2")]);
    const [result] = await applySyncBatch(db, [finishItem("workout-2", new Date("2026-01-02T11:00:00Z"), "f2")]);

    expect(result!.status).toBe("created");
    expect(result!.newMuscleSlugs).toEqual([]);
    expect(result!.varietyBonusXp).toBe(computeVarietyBonus(0));
    expect(result!.varietyBonusXp).toBe(0);
    // Additive-only: the second session's own consistency bonus (now streakDays=2) is unaffected
    // by scoring 0 on variety — it's strictly larger than day 1's, never penalized.
    expect(result!.consistencyBonusXp).toBe(computeConsistencyBonus(2));
    expect(result!.consistencyBonusXp!).toBeGreaterThan(computeConsistencyBonus(1));
  });

  it("a session training a genuinely new muscle gets a proportional variety bonus and names the muscle", async () => {
    const otherExerciseId = (await insertTestExercise(db, { slug: "other-exercise" })).id;
    await linkPrimaryMuscle(db, exerciseId, "shoulders");
    await linkPrimaryMuscle(db, otherExerciseId, "chest");

    const day1 = new Date("2026-01-01T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-1", exerciseId, day1, "s1")]);
    await applySyncBatch(db, [setItem("workout-1-we", day1, "set1")]);
    await applySyncBatch(db, [finishItem("workout-1", new Date("2026-01-01T11:00:00Z"), "f1")]);

    const day2 = new Date("2026-01-02T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-2", otherExerciseId, day2, "s2")]);
    await applySyncBatch(db, [setItem("workout-2-we", day2, "set2")]);
    const [result] = await applySyncBatch(db, [finishItem("workout-2", new Date("2026-01-02T11:00:00Z"), "f2")]);

    expect(result!.status).toBe("created");
    expect(result!.newMuscleSlugs).toEqual(["chest"]);
    expect(result!.varietyBonusXp).toBe(computeVarietyBonus(1));
  });

  it("persists consistencyBonusXp and varietyBonusXp on the workouts row, not just in the returned result", async () => {
    await linkPrimaryMuscle(db, exerciseId, "shoulders");
    const day1 = new Date("2026-01-01T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-1", exerciseId, day1, "s1")]);
    await applySyncBatch(db, [setItem("workout-1-we", day1, "set1")]);
    const [result] = await applySyncBatch(db, [finishItem("workout-1", new Date("2026-01-01T11:00:00Z"), "f1")]);

    const workoutRow = await db.query.workouts.findFirst({ where: eq(workouts.id, "workout-1") });
    expect(workoutRow!.consistencyBonusXp).toBe(result!.consistencyBonusXp);
    expect(workoutRow!.varietyBonusXp).toBe(result!.varietyBonusXp);
    expect(workoutRow!.consistencyBonusXp).not.toBeNull();
    expect(workoutRow!.varietyBonusXp).not.toBeNull();
  });

  it("a workout with zero logged sets finishes without throwing and produces zero bonuses", async () => {
    const day1 = new Date("2026-01-01T10:00:00Z");
    await applySyncBatch(db, [startItem("workout-1", exerciseId, day1, "s1")]);
    // No log_set items at all.
    const [result] = await applySyncBatch(db, [finishItem("workout-1", new Date("2026-01-01T11:00:00Z"), "f1")]);

    expect(result!.status).toBe("created");
    expect(result!.newMuscleSlugs).toEqual([]);
    expect(result!.varietyBonusXp).toBe(0);
    // Consistency bonus is still earned for showing up, even with zero sets logged.
    expect(result!.consistencyBonusXp).toBe(computeConsistencyBonus(1));

    const workoutRow = await db.query.workouts.findFirst({ where: eq(workouts.id, "workout-1") });
    expect(workoutRow!.varietyBonusXp).toBe(0);
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
