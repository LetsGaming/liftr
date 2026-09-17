/**
 * Regression coverage for the recomputeRankForExercise race condition fix: the
 * read-current-rank -> decide -> write-new-rank/rankEvents/prs sequence now runs inside a single
 * synchronous `db.transaction()` (see rankService.ts). Two describe blocks:
 *  - atomicity: a simulated failure partway through the write sequence must leave no partial
 *    state (no rank_events row without its matching ranks/prs write, or vice versa).
 *  - overlapping recomputes: two recomputes for the same exercise racing via Promise.all must
 *    still produce exactly one rank_events row for a genuine rank-up, not zero or two — the
 *    concrete failure mode the un-transactioned version had (two overlapping syncs could both
 *    read the same stale previous rank and both decide a rank-up occurred).
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_USER_ID, ranks, rankEvents, sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

const state = vi.hoisted(() => ({ throwOnInsertPr: false }));

// Mocks only insertPr (a write inside the recompute transaction) so it can be made to throw on
// demand — everything else in the module passes through to the real implementation.
vi.mock("~server/repositories/rankRepository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~server/repositories/rankRepository.js")>();
  return {
    ...actual,
    insertPr: (...args: Parameters<typeof actual.insertPr>) => {
      if (state.throwOnInsertPr) throw new Error("simulated mid-transaction failure");
      return actual.insertPr(...args);
    },
  };
});

const { recomputeRankForExercise } = await import("~server/services/rankService.js");

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
  state.throwOnInsertPr = false;
});

async function seedStandards(exerciseId: string) {
  await db.insert(standards).values([
    { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust: "real" },
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

describe("recomputeRankForExercise — transaction atomicity", () => {
  it("rolls back the rankEvents/ranks writes if a later write in the same transaction throws", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    const day1 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await logSet(ex.id, 60, 8, day1);
    await logSet(ex.id, 60, 8); // corroborates -> this recompute would be a genuine rank-up + PR

    state.throwOnInsertPr = true;
    await expect(recomputeRankForExercise(db, OWNER_USER_ID, ex.id)).rejects.toThrow("simulated mid-transaction failure");

    // insertRankEvent runs before the (now-throwing) insertPr inside the same synchronous
    // transaction — a real transaction boundary rolls that back too, not just leaves it uncommitted.
    const events = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(events).toHaveLength(0);

    // upsertRank also ran earlier in the same transaction and must be rolled back — no partial
    // "rank row exists but PR/rankEvents don't" state left behind.
    const rankRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(rankRow).toBeUndefined();
  });

  it("control: the same scenario without the injected failure commits normally", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    const day1 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await logSet(ex.id, 60, 8, day1);
    await logSet(ex.id, 60, 8);

    const result = await recomputeRankForExercise(db, OWNER_USER_ID, ex.id);
    expect(result!.rankedUp).toBe(true);
    const events = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(events).toHaveLength(1);
  });
});

describe("recomputeRankForExercise — overlapping recomputes stay consistent", () => {
  it("two racing recomputes for the same exercise produce exactly one rank_events row, not zero or two", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    const day1 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await logSet(ex.id, 60, 8, day1);
    await logSet(ex.id, 60, 8); // second, distinct day -> corroborated -> a genuine rank-up is due

    // Simulates two devices (or an outbox retry racing the original in-flight request) both
    // triggering a recompute for the same exercise at effectively the same time.
    const [a, b] = await Promise.all([
      recomputeRankForExercise(db, OWNER_USER_ID, ex.id),
      recomputeRankForExercise(db, OWNER_USER_ID, ex.id),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const events = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(events).toHaveLength(1); // exactly one genuine rank-up recorded, not duplicated by the race

    // Whichever call's transaction committed first reports the rank-up; the other, once it runs,
    // reads the already-committed peak and correctly finds nothing further to advance.
    expect([a!.rankedUp, b!.rankedUp].filter(Boolean)).toHaveLength(1);

    const rankRow = await db.query.ranks.findFirst({ where: eq(ranks.exerciseId, ex.id) });
    expect(rankRow!.peakTier).toBe("apprentice");
  });
});
