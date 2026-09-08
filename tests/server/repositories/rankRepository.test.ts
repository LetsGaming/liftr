import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import {
  findAllRanks,
  findAllRanksWithExercise,
  findBestPrByKind,
  findExerciseById,
  findLoggedSetsForExercise,
  findRankByExerciseId,
  findRankEventsSince,
  findStandardsForExercise,
  insertPr,
  insertRankEvent,
  upsertRank,
  type RankUpsert,
} from "~server/repositories/rankRepository.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function baseRankUpsert(exerciseId: string, overrides: Partial<RankUpsert> = {}): RankUpsert {
  return {
    exerciseId,
    tier: "initiate",
    division: 5,
    lp: 10,
    e1rm: 50,
    trust: "real",
    nextTargetWeightKg: 55,
    nextTargetReps: 5,
    peakTier: null,
    peakDivision: null,
    peakLp: null,
    peakE1rm: null,
    peakAchievedAt: null,
    ...overrides,
  };
}

describe("findExerciseById", () => {
  it("returns the exercise when it exists", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-1" });

    const result = await findExerciseById(db, ex.id);

    expect(result?.slug).toBe("rr-ex-1");
  });

  it("returns undefined when no exercise has that id", async () => {
    const result = await findExerciseById(db, "not-a-real-id");
    expect(result).toBeUndefined();
  });
});

describe("findAllRanks / findAllRanksWithExercise", () => {
  it("return an empty array when nothing has been computed", async () => {
    expect(await findAllRanks(db, OWNER_USER_ID)).toEqual([]);
    expect(await findAllRanksWithExercise(db, OWNER_USER_ID)).toEqual([]);
  });

  it("findAllRanksWithExercise nests the related exercise row", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-2" });
    await upsertRank(db, OWNER_USER_ID, baseRankUpsert(ex.id));

    const result = await findAllRanksWithExercise(db, OWNER_USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.exercise.slug).toBe("rr-ex-2");
  });

  it("findAllRanks returns the bare rank row without a joined exercise", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-3" });
    await upsertRank(db, OWNER_USER_ID, baseRankUpsert(ex.id));

    const result = await findAllRanks(db, OWNER_USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("exercise");
  });
});

describe("findStandardsForExercise", () => {
  async function insertStandard(exerciseId: string, sex: "male" | "female", threshold: number) {
    await db.insert(standards).values({ exerciseId, sex, metric: "load_ratio", tier: "initiate", division: 5, threshold, trust: "real" });
  }

  it("defaults to male standards when no sex is given", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-std" });
    await insertStandard(ex.id, "male", 1.0);
    await insertStandard(ex.id, "female", 0.7);

    const result = await findStandardsForExercise(db, ex.id);

    expect(result).toHaveLength(1);
    expect(result[0]!.threshold).toBe(1.0);
  });

  it("returns female standards when explicitly requested", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-std2" });
    await insertStandard(ex.id, "male", 1.0);
    await insertStandard(ex.id, "female", 0.7);

    const result = await findStandardsForExercise(db, ex.id, "female");

    expect(result).toHaveLength(1);
    expect(result[0]!.threshold).toBe(0.7);
  });

  it("does not return standards belonging to a different exercise", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-std3" });
    const other = await insertTestExercise(db, { slug: "rr-ex-std4" });
    await insertStandard(other.id, "male", 1.0);

    const result = await findStandardsForExercise(db, ex.id);

    expect(result).toEqual([]);
  });
});

describe("findLoggedSetsForExercise", () => {
  it("excludes warmup sets", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-sets" });
    const [workout] = await db.insert(workouts).values({ clientId: "w-rr", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: ex.id, orderIndex: 0 }).returning();
    await db.insert(sets).values([
      { workoutExerciseId: we!.id, setIndex: 0, weightKg: 20, reps: 10, kind: "warmup", isWarmup: true, loggedAt: new Date(), clientId: "s-warm" },
      { workoutExerciseId: we!.id, setIndex: 1, weightKg: 100, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-work" },
    ]);

    const result = await findLoggedSetsForExercise(db, OWNER_USER_ID, ex.id);

    expect(result).toHaveLength(1);
    expect(result[0]!.weightKg).toBe(100);
  });

  it("does not return sets for a different exercise", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-sets2" });
    const other = await insertTestExercise(db, { slug: "rr-ex-sets3" });
    const [workout] = await db.insert(workouts).values({ clientId: "w-rr2", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: other.id, orderIndex: 0 }).returning();
    await db.insert(sets).values({ workoutExerciseId: we!.id, setIndex: 0, weightKg: 100, reps: 5, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-other-ex" });

    const result = await findLoggedSetsForExercise(db, OWNER_USER_ID, ex.id);

    expect(result).toEqual([]);
  });
});

describe("upsertRank / findRankByExerciseId", () => {
  it("inserts a new rank row when none exists", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-upsert" });

    await upsertRank(db, OWNER_USER_ID, baseRankUpsert(ex.id, { tier: "trainee", division: 3, lp: 40 }));

    const result = await findRankByExerciseId(db, OWNER_USER_ID, ex.id);
    expect(result?.tier).toBe("trainee");
    expect(result?.division).toBe(3);
    expect(result?.lp).toBe(40);
  });

  it("overwrites the existing rank row on conflict rather than duplicating", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-upsert2" });
    await upsertRank(db, OWNER_USER_ID, baseRankUpsert(ex.id, { tier: "initiate", division: 5, lp: 10 }));

    await upsertRank(db, OWNER_USER_ID, baseRankUpsert(ex.id, { tier: "athlete", division: 2, lp: 90 }));

    const result = await findRankByExerciseId(db, OWNER_USER_ID, ex.id);
    expect(result?.tier).toBe("athlete");
    expect(result?.division).toBe(2);
    expect(result?.lp).toBe(90);

    const all = await findAllRanks(db, OWNER_USER_ID);
    expect(all).toHaveLength(1);
  });

  it("returns undefined for an exercise with no computed rank", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-norank" });

    const result = await findRankByExerciseId(db, OWNER_USER_ID, ex.id);

    expect(result).toBeUndefined();
  });
});

describe("findBestPrByKind / insertPr", () => {
  it("returns the highest-value pr for the given kind", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-pr" });
    await insertPr(db, OWNER_USER_ID, { exerciseId: ex.id, kind: "weight", value: 80, achievedAt: new Date("2026-08-01T10:00:00Z") });
    await insertPr(db, OWNER_USER_ID, { exerciseId: ex.id, kind: "weight", value: 100, achievedAt: new Date("2026-09-01T10:00:00Z") });
    await insertPr(db, OWNER_USER_ID, { exerciseId: ex.id, kind: "weight", value: 90, achievedAt: new Date("2026-08-15T10:00:00Z") });

    const result = await findBestPrByKind(db, OWNER_USER_ID, ex.id, "weight");

    expect(result?.value).toBe(100);
  });

  it("does not mix PRs of a different kind", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-pr2" });
    await insertPr(db, OWNER_USER_ID, { exerciseId: ex.id, kind: "weight", value: 100, achievedAt: new Date() });
    await insertPr(db, OWNER_USER_ID, { exerciseId: ex.id, kind: "reps", value: 200, achievedAt: new Date() });

    const result = await findBestPrByKind(db, OWNER_USER_ID, ex.id, "weight");

    expect(result?.value).toBe(100);
  });

  it("returns undefined when no pr of that kind exists", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-pr3" });

    const result = await findBestPrByKind(db, OWNER_USER_ID, ex.id, "e1rm");

    expect(result).toBeUndefined();
  });
});

describe("insertRankEvent / findRankEventsSince", () => {
  it("excludes events that occurred before the cutoff", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-event" });
    await insertRankEvent(db, OWNER_USER_ID, { exerciseId: ex.id, tier: "trainee", division: 3, occurredAt: new Date("2026-08-01T10:00:00Z"), plausibilityReason: null });
    await insertRankEvent(db, OWNER_USER_ID, { exerciseId: ex.id, tier: "athlete", division: 2, occurredAt: new Date("2026-09-05T10:00:00Z"), plausibilityReason: null });

    const result = await findRankEventsSince(db, OWNER_USER_ID, new Date("2026-09-01T00:00:00Z"));

    expect(result).toHaveLength(1);
    expect(new Date(result[0]!.occurredAt).toISOString()).toBe("2026-09-05T10:00:00.000Z");
  });

  it("carries the plausibility reason through", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-event2" });
    await insertRankEvent(db, OWNER_USER_ID, { exerciseId: ex.id, tier: "lifter", division: 1, occurredAt: new Date("2026-09-05T10:00:00Z"), plausibilityReason: "pace" });

    const result = await findRankEventsSince(db, OWNER_USER_ID, new Date("2026-09-01T00:00:00Z"));

    expect(result[0]!.plausibilityReason).toBe("pace");
  });

  it("includes events exactly at the cutoff (inclusive lower bound)", async () => {
    const ex = await insertTestExercise(db, { slug: "rr-ex-event3" });
    const cutoff = new Date("2026-09-01T00:00:00Z");
    await insertRankEvent(db, OWNER_USER_ID, { exerciseId: ex.id, tier: "trainee", division: 3, occurredAt: cutoff, plausibilityReason: null });

    const result = await findRankEventsSince(db, OWNER_USER_ID, cutoff);

    expect(result).toHaveLength(1);
  });
});
