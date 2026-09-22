import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { upsertRunRank, type RunRankUpsert } from "~server/repositories/runRankRepository.js";
import { getOverallRunnerRank } from "~server/services/overallRunnerRankService.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function baseRunRankUpsert(overrides: Partial<RunRankUpsert> = {}): RunRankUpsert {
  return {
    tier: "initiate",
    division: 5,
    lp: 10,
    bestSpeedMps: 3.5,
    trust: "real",
    nextTargetSpeedMps: 3.8,
    peakTier: null,
    peakDivision: null,
    peakLp: null,
    peakSpeedMps: null,
    peakAchievedAt: null,
    ...overrides,
  };
}

describe("getOverallRunnerRank", () => {
  it("returns null current/peak when nothing has been ranked yet", async () => {
    const result = await getOverallRunnerRank(db, OWNER_USER_ID);
    expect(result.current).toBeNull();
    expect(result.peak).toBeNull();
  });

  it("returns the aggregated current band once a category has a computed rank", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));

    const result = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(result.current).toMatchObject({ tier: "athlete" });
    expect(result.peak).toBeNull(); // no peak snapshot recorded yet on this row
  });

  it("returns the aggregated peak band once a peak snapshot exists", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({
        peakTier: "athlete",
        peakDivision: 3,
        peakLp: 50,
        peakSpeedMps: 4.0,
        peakAchievedAt: new Date("2026-08-01T00:00:00Z"),
      }));

    const result = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(result.peak).toMatchObject({ tier: "athlete" });
  });

  it("aggregates across multiple categories", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));
    await upsertRunRank(db, OWNER_USER_ID, "marathon", "run", baseRunRankUpsert({ tier: "elite", division: 3, lp: 50 }));

    const result = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(result.current).not.toBeNull();
  });

  it("a walk rank row does not move Overall Runner Rank", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));
    const withRunOnly = await getOverallRunnerRank(db, OWNER_USER_ID);

    // A wildly different walk rank must not shift the Runner aggregate at all — walking doesn't
    // count toward Overall Runner Rank (cardioActivities.ts's countsTowardOverallRunnerRank).
    await upsertRunRank(db, OWNER_USER_ID, "all", "walk", baseRunRankUpsert({ tier: "apex", division: 1, lp: 9999 }));
    const withWalkAdded = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(withWalkAdded).toEqual(withRunOnly);
  });

  it("a hike rank row does not move Overall Runner Rank either", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));
    const withRunOnly = await getOverallRunnerRank(db, OWNER_USER_ID);

    await upsertRunRank(db, OWNER_USER_ID, "all", "hike", baseRunRankUpsert({ tier: "apex", division: 1, lp: 9999 }));
    const withHikeAdded = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(withHikeAdded).toEqual(withRunOnly);
  });
});
