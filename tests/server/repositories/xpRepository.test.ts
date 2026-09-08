import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, runs, workouts, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { findAllRunsForXp, findTotalSessionBonusXp } from "~server/repositories/xpRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findTotalSessionBonusXp", () => {
  it("returns zero sums when there are no workouts at all", async () => {
    const result = await findTotalSessionBonusXp(db, OWNER_USER_ID);
    expect(result).toEqual({ totalConsistencyBonusXp: 0, totalVarietyBonusXp: 0 });
  });

  it("sums bonus columns only across finished workouts, treating null bonuses as 0", async () => {
    // Finished workout with real, non-null bonus values.
    await db.insert(workouts).values({
      clientId: "w-finished-with-bonus",
      startedAt: new Date("2026-09-01T10:00:00Z"),
      endedAt: new Date("2026-09-01T11:00:00Z"),
      pausedSeconds: 0,
      consistencyBonusXp: 850,
      varietyBonusXp: 1500,
    });

    // Finished workout with null bonus values — the columns are nullable at the schema level,
    // even though the real finish-workout write path always sets them; this exercises that
    // type-level null case directly.
    await db.insert(workouts).values({
      clientId: "w-finished-no-bonus",
      startedAt: new Date("2026-09-02T10:00:00Z"),
      endedAt: new Date("2026-09-02T11:00:00Z"),
      pausedSeconds: 0,
      consistencyBonusXp: null,
      varietyBonusXp: null,
    });

    // Unfinished workout (never ended) — must be excluded even though it has no bonus values.
    await db.insert(workouts).values({
      clientId: "w-unfinished",
      startedAt: new Date("2026-09-03T10:00:00Z"),
      pausedSeconds: 0,
    });

    const result = await findTotalSessionBonusXp(db, OWNER_USER_ID);

    expect(result.totalConsistencyBonusXp).toBe(850);
    expect(result.totalVarietyBonusXp).toBe(1500);
    expect(Number.isNaN(result.totalConsistencyBonusXp)).toBe(false);
    expect(Number.isNaN(result.totalVarietyBonusXp)).toBe(false);
  });
});

describe("findAllRunsForXp", () => {
  it("returns an empty array when the user has no runs", async () => {
    const result = await findAllRunsForXp(db, OWNER_USER_ID);
    expect(result).toEqual([]);
  });

  it("selects distanceM, durationS, startedAt, plausibilityMultiplier for every run, no join required", async () => {
    await db.insert(runs).values({
      userId: OWNER_USER_ID,
      source: "gpx",
      name: null,
      startedAt: new Date("2026-09-01T10:00:00Z"),
      distanceM: 5000,
      durationS: 1500,
      avgPaceSPerKm: 300,
      plausibilityMultiplier: 0.8,
      clientId: "xp-run-gps",
    });
    // Manual run: plausibilityMultiplier is always null in the DB (the gate never runs against
    // manual entries) — this row is the one Ruling 5's `?? 1` mapping exists to protect.
    await db.insert(runs).values({
      userId: OWNER_USER_ID,
      source: "manual",
      name: null,
      startedAt: new Date("2026-09-02T10:00:00Z"),
      distanceM: 10000,
      durationS: 3000,
      avgPaceSPerKm: 300,
      plausibilityMultiplier: null,
      clientId: "xp-run-manual",
    });

    const result = await findAllRunsForXp(db, OWNER_USER_ID);

    expect(result).toHaveLength(2);
    const gps = result.find((r) => r.distanceM === 5000)!;
    expect(gps.durationS).toBe(1500);
    expect(gps.startedAt).toEqual(new Date("2026-09-01T10:00:00Z"));
    expect(gps.plausibilityMultiplier).toBe(0.8);

    const manual = result.find((r) => r.distanceM === 10000)!;
    expect(manual.plausibilityMultiplier).toBeNull();
  });

  it("does not leak another user's runs", async () => {
    const { insertTestUser } = await import("../helpers/testDb.js");
    const otherUser = await insertTestUser(db);
    await db.insert(runs).values({
      userId: otherUser.id,
      source: "gpx",
      name: null,
      startedAt: new Date("2026-09-01T10:00:00Z"),
      distanceM: 5000,
      durationS: 1500,
      avgPaceSPerKm: 300,
      clientId: "xp-run-other",
    });

    const result = await findAllRunsForXp(db, OWNER_USER_ID);
    expect(result).toEqual([]);
  });
});
