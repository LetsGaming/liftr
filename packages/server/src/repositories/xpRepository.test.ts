import { beforeEach, describe, expect, it } from "vitest";
import { workouts, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../services/testDb.js";
import { findTotalSessionBonusXp } from "./xpRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findTotalSessionBonusXp", () => {
  it("returns zero sums when there are no workouts at all", async () => {
    const result = await findTotalSessionBonusXp(db);
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

    // Finished workout with null bonus values (e.g. finished before this feature shipped).
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

    const result = await findTotalSessionBonusXp(db);

    expect(result.totalConsistencyBonusXp).toBe(850);
    expect(result.totalVarietyBonusXp).toBe(1500);
    expect(Number.isNaN(result.totalConsistencyBonusXp)).toBe(false);
    expect(Number.isNaN(result.totalVarietyBonusXp)).toBe(false);
  });
});
