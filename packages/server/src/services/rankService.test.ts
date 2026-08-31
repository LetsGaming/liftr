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

async function logSet(exerciseId: string, weightKg: number, reps: number, loggedAt: Date = new Date()) {
  const [workout] = await db.insert(workouts).values({ clientId: `w-${Math.random()}`, startedAt: new Date(), pausedSeconds: 0 }).returning();
  const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId, orderIndex: 0 }).returning();
  await db.insert(sets).values({
    workoutExerciseId: we!.id,
    setIndex: 0,
    weightKg,
    reps,
    kind: "normal",
    isWarmup: false,
    loggedAt,
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
    // absolute load), but the naive ratio (e1rm / bodyweight) would drop if recomputed fresh.
    // Peak must not regress — and (once R2's floor-protected current band is wired in below)
    // the *displayed* current rank doesn't regress either, since it's peak-derived and this
    // recompute happens with zero days since last trained (no decay yet).
    await db.insert(bodyweightLogs).values({ date: "2026-02-01", weightKg: 130 });
    const second = await recomputeRankForExercise(db, ex.id);
    expect(second!.tier).toBe(firstRow!.tier); // fixed: no longer regresses
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

  /** Standards with three silver divisions modeled, so a peak can land above division III and
   *  decay has somewhere real to soften to within the same tier. */
  async function seedMultiDivisionStandards(exerciseId: string) {
    await db.insert(standards).values([
      { exerciseId, sex: "male", metric: "load_ratio", tier: "bronze", division: 3, threshold: 0.5, trust: "real" },
      { exerciseId, sex: "male", metric: "load_ratio", tier: "silver", division: 3, threshold: 1.1, trust: "real" },
      { exerciseId, sex: "male", metric: "load_ratio", tier: "silver", division: 2, threshold: 1.3, trust: "real" },
      { exerciseId, sex: "male", metric: "load_ratio", tier: "silver", division: 1, threshold: 1.5, trust: "real" },
    ]);
  }

  it("current rank (R2) decays below peak once the exercise hasn't been trained in a long time", async () => {
    const ex = await insertTestExercise(db);
    await seedMultiDivisionStandards(ex.id);

    // 90kg x 8 at the 75kg fallback bodyweight -> ratio ~1.52 -> silver/I (top division).
    // Log it 200 days ago (well past grace + window) so decay is fully in effect "today."
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await logSet(ex.id, 90, 8, longAgo);
    const result = await recomputeRankForExercise(db, ex.id);

    const row = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(row!.peakTier).toBe("silver");
    expect(row!.peakDivision).toBe(1); // peak itself is untouched by decay

    // Displayed current is floored at division III / 0 LP of the peak's own tier — softened,
    // but never a lower tier than peak.
    expect(result!.tier).toBe("silver");
    expect(result!.division).toBe(3);
    expect(result!.lp).toBe(0);
    expect(row!.tier).toBe("silver");
    expect(row!.division).toBe(3);
    expect(row!.lp).toBe(0);
  });

  it("current rank (R2) snaps straight back to peak, not gradually, the instant a new set is logged", async () => {
    const ex = await insertTestExercise(db);
    await seedMultiDivisionStandards(ex.id);

    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await logSet(ex.id, 90, 8, longAgo);
    await recomputeRankForExercise(db, ex.id);
    const decayed = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(decayed!.division).not.toBe(decayed!.peakDivision);

    // A fresh set today (even a weak one) resets daysSinceLastTrained to 0 -> full snap-back.
    await logSet(ex.id, 10, 5);
    await recomputeRankForExercise(db, ex.id);
    const snappedBack = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(snappedBack!.tier).toBe("silver");
    expect(snappedBack!.division).toBe(snappedBack!.peakDivision);
    expect(snappedBack!.lp).toBe(snappedBack!.peakLp);
  });

  it("a decay-only recompute never writes a rank_events row (decay is not a rank-up)", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);

    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await logSet(ex.id, 90, 8, longAgo);
    await recomputeRankForExercise(db, ex.id); // first-ever computation: genuine rank-up, 1 row
    let rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(1);

    // Recompute again with no new set (simulating "time passed, decay applied on next
    // recompute") — the current band moved, but peak did not, so no new event.
    const result = await recomputeRankForExercise(db, ex.id);
    expect(result!.rankedUp).toBe(false);
    rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(1);
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
