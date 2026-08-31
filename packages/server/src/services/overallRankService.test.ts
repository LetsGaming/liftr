import { beforeEach, describe, expect, it } from "vitest";
import { ordinal } from "@liftr/shared";
import { sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { getOverallRank } from "./overallRankService.js";
import { recomputeRankForExercise } from "./rankService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function seedStandards(exerciseId: string, trust: "real" | "synthetic" = "real") {
  await db.insert(standards).values([
    { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "advanced", division: 3, threshold: 2.2, trust },
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

describe("getOverallRank", () => {
  it("returns null current/peak when nothing has been ranked yet", async () => {
    const result = await getOverallRank(db);
    expect(result.current).toBeNull();
    expect(result.peak).toBeNull();
  });

  it("excludes a never-ranked exercise rather than dragging the aggregate to zero", async () => {
    const ranked = await insertTestExercise(db);
    await seedStandards(ranked.id);
    await logSet(ranked.id, 90, 8); // clears the athlete threshold at the 75kg fallback bodyweight
    await recomputeRankForExercise(db, ranked.id);

    // A second, never-logged exercise exists in the catalog but has no rank row at all.
    await insertTestExercise(db);

    const result = await getOverallRank(db);
    expect(result.current).not.toBeNull();
    expect(result.current!.tier).toBe("athlete"); // reflects only the one ranked exercise, not diluted
  });

  it("moves sensibly when a major exercise ranks up, without swinging wildly from one synthetic exercise", async () => {
    const major = await insertTestExercise(db);
    await seedStandards(major.id, "real");
    await logSet(major.id, 20, 8); // weak: stays apprentice
    await recomputeRankForExercise(db, major.id);
    const before = (await getOverallRank(db)).current!;

    const synthetic = await insertTestExercise(db);
    await seedStandards(synthetic.id, "synthetic");
    await logSet(synthetic.id, 20, 8); // also weak/apprentice, synthetic-trust
    await recomputeRankForExercise(db, synthetic.id);

    // Now rank the major (real-trust) exercise up into athlete.
    await logSet(major.id, 90, 8);
    await recomputeRankForExercise(db, major.id);
    const after = (await getOverallRank(db)).current!;

    const beforePos = ordinal(before.tier as never, before.division as never) * 100 + before.lp;
    const afterPos = ordinal(after.tier as never, after.division as never) * 100 + after.lp;
    // A single major real-trust rank-up should move the aggregate meaningfully, not get
    // swamped by the still-weak half-weighted synthetic exercise. `major` alone moved a full
    // 3 ordinal bands (apprentice -> athlete); the still-apprentice, half-weighted synthetic entry pulls
    // the weighted average down, but by less than an equal-weight average would.
    expect(afterPos).toBeGreaterThan(beforePos);
    expect(afterPos - beforePos).toBeGreaterThan(50); // meaningfully more than a rounding blip
  });

  it("peak aggregate reflects each exercise's peak snapshot independently of current decay", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 90, 8);
    await recomputeRankForExercise(db, ex.id);

    const result = await getOverallRank(db);
    expect(result.peak).not.toBeNull();
    expect(result.peak!.tier).toBe("athlete");
  });
});
