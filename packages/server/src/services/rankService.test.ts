import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, ranks, rankEvents, sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { writeJsonSetting } from "../repositories/settingsRepository.js";
import { computeRankEventsByWeekday, getCurrentBodyweightKg, getUserSex, recomputeRankForExercise } from "./rankService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function seedStandards(exerciseId: string, sex: "male" | "female" = "male") {
  await db.insert(standards).values([
    { exerciseId, sex, metric: "load_ratio", tier: "bronze", division: 3, threshold: 0.5, trust: "real" },
    { exerciseId, sex, metric: "load_ratio", tier: "bronze", division: 2, threshold: 0.7, trust: "real" },
    { exerciseId, sex, metric: "load_ratio", tier: "silver", division: 3, threshold: 1.1, trust: "real" },
  ]);
}

async function logSet(exerciseId: string, weightKg: number, reps: number) {
  const [workout] = await db.insert(workouts).values({ clientId: `w-${Math.random()}`, startedAt: new Date(), pausedSeconds: 0 }).returning();
  const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId, orderIndex: 0 }).returning();
  await db.insert(sets).values({
    workoutExerciseId: we!.id,
    setIndex: 0,
    weightKg,
    reps,
    kind: "normal",
    isWarmup: false,
    loggedAt: new Date(),
    clientId: `s-${Math.random()}`,
  });
}

describe("recomputeRankForExercise", () => {
  it("returns null when the exercise has no logged sets", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    expect(await recomputeRankForExercise(db, ex.id)).toBeNull();
  });

  it("returns null when no standards are modeled for the exercise (e.g. plank)", async () => {
    const ex = await insertTestExercise(db);
    await logSet(ex.id, 60, 8);
    expect(await recomputeRankForExercise(db, ex.id)).toBeNull();
  });

  it("resolves a tier from the best logged set's e1RM / bodyweight ratio", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    // default fallback bodyweight is 75kg; 60kg x 8 reps -> e1rm ~76 -> ratio ~1.01 -> bronze/II
    await logSet(ex.id, 60, 8);
    const result = await recomputeRankForExercise(db, ex.id);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("bronze");
  });

  it("flags rankedUp on the first-ever computation and detects a new PR", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    const result = await recomputeRankForExercise(db, ex.id);
    expect(result!.rankedUp).toBe(true);
    expect(result!.newPr).toEqual({ kind: "e1rm", value: expect.any(Number) });
  });

  it("does not flag a PR on a second, weaker set", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);
    await logSet(ex.id, 40, 5);
    const second = await recomputeRankForExercise(db, ex.id);
    expect(second!.newPr).toBeNull();
  });

  it("uses sex-specific standards when the profile sets one (QUAL-04)", async () => {
    const ex = await insertTestExercise(db);
    // female thresholds set deliberately lower, so the same set crosses into silver only for "female"
    await db.insert(standards).values([
      { exerciseId: ex.id, sex: "male", metric: "load_ratio", tier: "bronze", division: 3, threshold: 0.5, trust: "real" },
      { exerciseId: ex.id, sex: "male", metric: "load_ratio", tier: "silver", division: 3, threshold: 5.0, trust: "real" },
      { exerciseId: ex.id, sex: "female", metric: "load_ratio", tier: "bronze", division: 3, threshold: 0.3, trust: "derived" },
      { exerciseId: ex.id, sex: "female", metric: "load_ratio", tier: "silver", division: 3, threshold: 0.8, trust: "derived" },
    ]);
    await logSet(ex.id, 60, 8); // e1rm ~76, ratio ~1.01 at the 75kg fallback bodyweight

    const maleResult = await recomputeRankForExercise(db, ex.id);
    expect(maleResult!.tier).toBe("bronze"); // 1.01 is below the male silver threshold of 5.0

    // Same logged history, switch the stored profile to female, recompute again.
    await writeJsonSetting(db, "profile", { sex: "female" });
    const femaleResult = await recomputeRankForExercise(db, ex.id);
    expect(femaleResult!.tier).toBe("silver"); // 1.01 clears the female silver threshold of 0.8
  });

  it("logs exactly one rank_events row per genuine tier/division change, not per set logged (W8)", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);

    // First set: first-ever computation always flags rankedUp -> one event row.
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);
    let rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tier).toBe("bronze");

    // A second, weaker set doesn't change tier/division -> rankedUp false -> no new row.
    await logSet(ex.id, 40, 5);
    await recomputeRankForExercise(db, ex.id);
    rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(1);

    // A set that clears the silver threshold genuinely ranks up -> a second row.
    await logSet(ex.id, 90, 8);
    const result = await recomputeRankForExercise(db, ex.id);
    expect(result!.rankedUp).toBe(true);
    rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(2);
    expect(rows[1]!.tier).toBe("silver");
  });

  it("peak (R1) never regresses when a later bodyweight increase alone would lower the naive ratio", async () => {
    const ex = await insertTestExercise(db); // not bodyweight-relative: e1RM is a fixed absolute load
    await seedStandards(ex.id);

    // Bodyweight 75kg (fallback): 60kg x 8 -> e1rm ~76 -> ratio ~1.01 -> bronze/II.
    // Bump the set weight so the ratio clears silver (>1.1) to exercise the peak-ratchet path.
    await db.insert(bodyweightLogs).values({ date: "2026-01-01", weightKg: 75 });
    await logSet(ex.id, 85, 8);
    const first = await recomputeRankForExercise(db, ex.id);
    expect(first!.rankedUp).toBe(true);
    const firstRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(firstRow!.tier).toBe("silver");
    expect(firstRow!.peakTier).toBe(firstRow!.tier);
    expect(firstRow!.peakDivision).toBe(firstRow!.division);
    const firstPeakOrdinal = `${firstRow!.peakTier}-${firstRow!.peakDivision}`;

    // Bodyweight jumps up with no new strength gain and no new set: e1rm is unchanged (fixed
    // absolute load), but the ratio (e1rm / bodyweight) naively drops. Peak must not regress.
    await db.insert(bodyweightLogs).values({ date: "2026-02-01", weightKg: 130 });
    const second = await recomputeRankForExercise(db, ex.id);
    expect(second!.tier).not.toBe(firstRow!.tier); // sanity: the naive current rank *did* drop
    const secondRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(`${secondRow!.peakTier}-${secondRow!.peakDivision}`).toBe(firstPeakOrdinal);
    expect(secondRow!.peakLp).toBe(firstRow!.peakLp);
    expect(secondRow!.peakE1rm).toBe(firstRow!.peakE1rm);
  });

  it("peak (R1) ratchets forward when a genuinely stronger set is logged", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);
    const before = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });

    await logSet(ex.id, 90, 8); // clears the silver threshold
    await recomputeRankForExercise(db, ex.id);
    const after = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });

    expect(after!.peakTier).toBe("silver");
    expect(after!.peakE1rm).toBeGreaterThan(before!.peakE1rm!);
  });
});

describe("computeRankEventsByWeekday", () => {
  it("returns all 7 weekdays, zero-filled when nothing has happened", async () => {
    const result = await computeRankEventsByWeekday(db);
    expect(result).toHaveLength(7);
    expect(result.every((r) => r.count === 0)).toBe(true);
    expect(result.map((r) => r.weekday).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("counts a genuine rank-up on today's weekday", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);

    const result = await computeRankEventsByWeekday(db);
    const todayWeekday = new Date().getDay();
    const total = result.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(1);
    expect(result.find((r) => r.weekday === todayWeekday)!.count).toBe(1);
  });
});

describe("getCurrentBodyweightKg", () => {
  it("falls back to the hardcoded default when nothing is logged", async () => {
    expect(await getCurrentBodyweightKg(db)).toBe(75);
  });
});

describe("getUserSex", () => {
  it("defaults to male when the profile is unset", async () => {
    expect(await getUserSex(db)).toBe("male");
  });

  it("reads the stored profile's sex once set", async () => {
    await writeJsonSetting(db, "profile", { sex: "female" });
    expect(await getUserSex(db)).toBe("female");
  });
});
