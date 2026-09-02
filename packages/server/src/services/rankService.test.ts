import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, prs, ranks, rankEvents, sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { ordinal, type Tier } from "@liftr/shared";
import { writeJsonSetting } from "../repositories/settingsRepository.js";
import { computeRankEventsByWeekday, getCurrentBodyweightKg, getUserSex, recomputeRankForExercise } from "./rankService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function seedStandards(exerciseId: string, sex: "male" | "female" = "male") {
  await db.insert(standards).values([
    { exerciseId, sex, metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
    { exerciseId, sex, metric: "load_ratio", tier: "apprentice", division: 2, threshold: 0.7, trust: "real" },
    { exerciseId, sex, metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust: "real" },
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
    // default fallback bodyweight is 75kg; 60kg x 8 reps -> e1rm ~76 -> ratio ~1.01 -> apprentice/II
    await logSet(ex.id, 60, 8);
    const result = await recomputeRankForExercise(db, ex.id);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("apprentice");
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
    // female thresholds set deliberately lower, so the same set crosses into athlete only for "female"
    await db.insert(standards).values([
      { exerciseId: ex.id, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
      { exerciseId: ex.id, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 5.0, trust: "real" },
      { exerciseId: ex.id, sex: "female", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.3, trust: "derived" },
      { exerciseId: ex.id, sex: "female", metric: "load_ratio", tier: "athlete", division: 3, threshold: 0.8, trust: "derived" },
    ]);
    await logSet(ex.id, 60, 8); // e1rm ~76, ratio ~1.01 at the 75kg fallback bodyweight

    const maleResult = await recomputeRankForExercise(db, ex.id);
    expect(maleResult!.tier).toBe("apprentice"); // 1.01 is below the male athlete threshold of 5.0

    // Same logged history, switch the stored profile to female, recompute again. The *peak*
    // switches to athlete immediately (ratchetPeak just compares strength, no session concept
    // involved). The displayed *current* band also reflects it immediately here, not gradually:
    // going into this recompute, `previousCurrentBand` (set by the male recompute above) already
    // equals the old (male) peak exactly — the lifter was fully caught up, no decay backlog —
    // so the buffed recovery-gain throttle correctly does not engage even though this is a
    // same-day recompute; only a genuine backlog (current sitting below the OLD peak) should
    // throttle the climb (see the dedicated decay/recovery tests above for that case).
    await writeJsonSetting(db, "profile", { sex: "female" });
    const femaleResult = await recomputeRankForExercise(db, ex.id);
    const femaleRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(femaleRow!.peakTier).toBe("athlete");
    expect(femaleResult!.tier).toBe("athlete"); // reflected immediately: no backlog to throttle
    const maleCurrentPos = ordinal(maleResult!.tier as Tier, maleResult!.division) * 100 + maleResult!.lp;
    const femaleCurrentPos = ordinal(femaleResult!.tier as Tier, femaleResult!.division) * 100 + femaleResult!.lp;
    expect(femaleCurrentPos).toBeGreaterThan(maleCurrentPos); // moved to the new, stronger peak
  });

  it("logs exactly one rank_events row per genuine tier/division change, not per set logged (W8)", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);

    // First set: first-ever computation always flags rankedUp -> one event row.
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);
    let rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tier).toBe("apprentice");

    // A second, weaker set doesn't change tier/division -> rankedUp false -> no new row.
    await logSet(ex.id, 40, 5);
    await recomputeRankForExercise(db, ex.id);
    rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(1);

    // A set that clears the athlete threshold genuinely ranks up -> a second row.
    await logSet(ex.id, 90, 8);
    const result = await recomputeRankForExercise(db, ex.id);
    expect(result!.rankedUp).toBe(true);
    rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(2);
    expect(rows[1]!.tier).toBe("athlete");
  });

  it("peak (R1) never regresses when a later bodyweight increase alone would lower the naive ratio", async () => {
    const ex = await insertTestExercise(db); // not bodyweight-relative: e1RM is a fixed absolute load
    await seedStandards(ex.id);

    // Bodyweight 75kg (fallback): 60kg x 8 -> e1rm ~76 -> ratio ~1.01 -> apprentice/II.
    // Bump the set weight so the ratio clears athlete (>1.1) to exercise the peak-ratchet path.
    await db.insert(bodyweightLogs).values({ date: "2026-01-01", weightKg: 75 });
    await logSet(ex.id, 85, 8);
    const first = await recomputeRankForExercise(db, ex.id);
    expect(first!.rankedUp).toBe(true);
    const firstRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(firstRow!.tier).toBe("athlete");
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

    await logSet(ex.id, 90, 8); // clears the athlete threshold
    await recomputeRankForExercise(db, ex.id);
    const after = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });

    expect(after!.peakTier).toBe("athlete");
    expect(after!.peakE1rm).toBeGreaterThan(before!.peakE1rm!);

    // A same-day genuine PR must be reflected in the *displayed current* band immediately, not
    // throttled through the buffed recovery-gain climb — that mechanic exists only for returning
    // from a real decay backlog. Here `before` was fully caught up (current == old peak, no
    // backlog), so the new peak this set just earned must show up right away, not gradually.
    expect(after!.tier).toBe(after!.peakTier);
    expect(after!.division).toBe(after!.peakDivision);
    expect(after!.lp).toBe(after!.peakLp);
  });

  /** Standards with three athlete divisions modeled, so a peak can land above division III and
   *  decay has somewhere real to soften to within the same tier. */
  async function seedMultiDivisionStandards(exerciseId: string) {
    await db.insert(standards).values([
      { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
      { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust: "real" },
      { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 2, threshold: 1.3, trust: "real" },
      { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 1, threshold: 1.5, trust: "real" },
    ]);
  }

  it("current rank (R2) decays below peak once the exercise hasn't been trained in a long time", async () => {
    const ex = await insertTestExercise(db);
    await seedMultiDivisionStandards(ex.id);

    // 90kg x 8 at the 75kg fallback bodyweight -> ratio ~1.52 -> athlete/I (top division).
    // Log it 200 days ago (well past grace + window) so decay is fully in effect "today."
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await logSet(ex.id, 90, 8, longAgo);
    const result = await recomputeRankForExercise(db, ex.id);

    const row = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(row!.peakTier).toBe("athlete");
    expect(row!.peakDivision).toBe(1); // peak itself is untouched by decay

    // Displayed current is floored at division IV (athlete's actual weakest division per
    // TIER_DIVISION_COUNT, not the 3-division fixture below) / 0 LP of the peak's own tier —
    // softened, but never a lower tier than peak.
    expect(result!.tier).toBe("athlete");
    expect(result!.division).toBe(4);
    expect(result!.lp).toBe(0);
    expect(row!.tier).toBe("athlete");
    expect(row!.division).toBe(4);
    expect(row!.lp).toBe(0);
  });

  it("current rank (R2/v2) moves toward peak, faster than normal, not instantly, once a new set is logged", async () => {
    const ex = await insertTestExercise(db);
    await seedMultiDivisionStandards(ex.id);

    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await logSet(ex.id, 90, 8, longAgo);
    await recomputeRankForExercise(db, ex.id);
    const decayed = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(decayed!.division).not.toBe(decayed!.peakDivision);

    // A fresh set today (even a weak one) resets daysSinceLastTrained to 0 -> a buffed
    // recovery-gain climb (rank engine v2), not the old instant full snap-back to peak.
    await logSet(ex.id, 10, 5);
    await recomputeRankForExercise(db, ex.id);
    const afterReturn = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(afterReturn!.tier).toBe("athlete");

    const decayedPos = ordinal(decayed!.tier, decayed!.division) * 100 + decayed!.lp;
    const returnedPos = ordinal(afterReturn!.tier, afterReturn!.division) * 100 + afterReturn!.lp;
    const peakPos = ordinal(afterReturn!.peakTier!, afterReturn!.peakDivision!) * 100 + afterReturn!.peakLp!;
    expect(returnedPos).toBeGreaterThan(decayedPos); // climbed toward peak
    expect(returnedPos).toBeLessThan(peakPos); // but did not instantly snap all the way there
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

  it("returning after decay climbs gradually, not instantly, toward peak", async () => {
    const ex = await insertTestExercise(db);
    await seedMultiDivisionStandards(ex.id);

    // Log the ONLY set 200 days ago: a first-ever recompute both establishes the peak and (since
    // passive decay runs unconditionally, even on a first-ever computation) immediately decays
    // the current band down to the floor — `daysSinceLastTrained` is derived from the *max* of
    // every logged set's timestamp, so a second, more-recent set of the same exercise would mask
    // the decay entirely; this test deliberately has only the one old-dated set at this point.
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await logSet(ex.id, 90, 8, longAgo); // 90kg x 8 at 75kg fallback bodyweight -> ratio ~1.52 -> athlete/I
    const decayed = await recomputeRankForExercise(db, ex.id);
    expect(decayed).not.toBeNull();
    const decayedRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(decayedRow!.peakTier).toBe("athlete");
    expect(decayedRow!.peakDivision).toBe(1); // peak untouched by decay
    expect(decayedRow!.tier).toBe("athlete");
    expect(decayedRow!.division).toBe(4); // fully decayed to the tier floor (TIER_DIVISION_COUNT.athlete)
    expect(decayedRow!.lp).toBe(0);

    // Now return: log a fresh, unremarkable set today (same weight, not a new peak).
    await logSet(ex.id, 90, 8);
    const afterReturn = await recomputeRankForExercise(db, ex.id);
    expect(afterReturn).not.toBeNull();
    const returnedRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });

    // Gradual climb, not an instant snap: current should have moved toward peak (a stronger
    // position than the fully-decayed floor) but must NOT have reached peak's division in a
    // single session — that would be the old (pre-v2) instant-snap behavior this buffed-gain
    // mechanic replaced.
    const decayedPos = ordinal(decayedRow!.tier, decayedRow!.division) * 100 + decayedRow!.lp;
    const returnedPos = ordinal(returnedRow!.tier, returnedRow!.division) * 100 + returnedRow!.lp;
    const peakPos = ordinal(returnedRow!.peakTier!, returnedRow!.peakDivision!) * 100 + returnedRow!.peakLp!;
    expect(returnedPos).toBeGreaterThan(decayedPos); // moved toward peak
    expect(returnedPos).toBeLessThan(peakPos); // but did not instantly snap all the way there
  });

  it("a flagged (implausible) workout is blocked from advancing peak", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8); // establish a normal peak (bodyweight-relative exercise, ratio-based)
    await recomputeRankForExercise(db, ex.id);
    const before = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });

    await logSet(ex.id, 400, 5); // a huge, implausible jump
    const result = await recomputeRankForExercise(db, ex.id, 0.02); // simulated flagged multiplier, below the peak-eligibility floor
    expect(result).not.toBeNull();
    const rank = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    // peak must not have advanced to reflect the 400kg set
    expect(rank!.peakE1rm).toBe(before!.peakE1rm);
    expect(rank!.peakTier).toBe(before!.peakTier);
    expect(rank!.peakDivision).toBe(before!.peakDivision);
  });

  it("a badly-flagged workout is hard-blocked from recording a PR at all (Phase 3 hard-block)", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8); // establishes a normal PR
    await recomputeRankForExercise(db, ex.id);
    const before = await db.query.prs.findFirst({ where: eq(prs.exerciseId, ex.id) });
    expect(before).not.toBeUndefined();

    await logSet(ex.id, 90, 8); // a genuinely higher e1RM, would otherwise be a new PR
    const result = await recomputeRankForExercise(db, ex.id, 0.02); // far below PR_ELIGIBILITY_FLOOR
    expect(result!.newPr).toBeNull();
    const after = await db.query.prs.findFirst({
      where: eq(prs.exerciseId, ex.id),
      orderBy: desc(prs.value),
    });
    // no new PR row was written — the stored PR is still the original, lower value
    expect(after!.value).toBe(before!.value);
  });

  it("a moderately-flagged workout (below PR floor, at/above peak floor) blocks the PR but still advances peak", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);

    await logSet(ex.id, 90, 8); // genuinely higher e1RM
    // 0.4 sits between PEAK_ELIGIBILITY_FLOOR (0.3) and PR_ELIGIBILITY_FLOOR (0.5): peak-eligible,
    // PR-ineligible — this is exactly the gap the stricter PR floor is meant to create.
    const result = await recomputeRankForExercise(db, ex.id, 0.4);
    expect(result!.newPr).toBeNull(); // PR blocked
    const rank = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(rank!.peakTier).toBe("athlete"); // peak still advanced
  });

  it("a session exactly at PR_ELIGIBILITY_FLOOR is still eligible for a PR (boundary is inclusive)", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    const result = await recomputeRankForExercise(db, ex.id, 0.5); // == PR_ELIGIBILITY_FLOOR
    expect(result!.newPr).not.toBeNull();
  });

  it("a flagged workout still contributes a heavily-discounted recovery gain", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    const result = await recomputeRankForExercise(db, ex.id, 0.5);
    expect(result).not.toBeNull(); // still recomputes, just discounted — never a no-op/error
  });

  it("a flagged first-ever session (no prior peak) does not establish a peak at all", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    // No prior recompute for this exercise -> storedPeak is null. A badly flagged session (below
    // PEAK_ELIGIBILITY_FLOOR) is exactly the case the plausibility ceiling check exists to catch
    // (an absurd first-ever session) — but with no storedPeak, the improbable-jump check can't
    // even fire, so the ceiling check is the only safeguard. Peak must stay unestablished rather
    // than being seeded from this flagged data.
    await logSet(ex.id, 400, 5); // huge, implausible for a brand-new exercise
    const result = await recomputeRankForExercise(db, ex.id, 0.02); // below PEAK_ELIGIBILITY_FLOOR
    expect(result).not.toBeNull();

    const row = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(row!.peakTier).toBeNull();
    expect(row!.peakDivision).toBeNull();
    expect(row!.peakLp).toBeNull();
    expect(row!.peakE1rm).toBeNull();
    expect(row!.peakAchievedAt).toBeNull();
    // With no peak, the displayed current band falls back to the plain freshly-resolved value.
    expect(row!.tier).toBe(result!.tier);
    expect(row!.division).toBe(result!.division);
  });

  it("a flagged first-ever session does not fire rankedUp or log a rank_events row", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 400, 5);
    const result = await recomputeRankForExercise(db, ex.id, 0.02);
    expect(result!.rankedUp).toBe(false);
    const rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(0);
  });

  it("a normal (non-flagged) first-ever session is unaffected and still establishes peak", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    const result = await recomputeRankForExercise(db, ex.id); // default multiplier = 1, fully plausible
    expect(result!.rankedUp).toBe(true);
    const row = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(row!.peakTier).not.toBeNull();
    expect(row!.peakTier).toBe(row!.tier);
    expect(row!.peakDivision).toBe(row!.division);
    const rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
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
