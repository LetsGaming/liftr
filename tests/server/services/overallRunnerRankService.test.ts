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
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));

    const result = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(result.current).toMatchObject({ tier: "athlete" });
    expect(result.peak).toBeNull(); // no peak snapshot recorded yet on this row
  });

  it("returns the aggregated peak band once a peak snapshot exists", async () => {
    await upsertRunRank(
      db,
      OWNER_USER_ID,
      "5k",
      baseRunRankUpsert({
        peakTier: "athlete",
        peakDivision: 3,
        peakLp: 50,
        peakSpeedMps: 4.0,
        peakAchievedAt: new Date("2026-08-01T00:00:00Z"),
      }),
    );

    const result = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(result.peak).toMatchObject({ tier: "athlete" });
  });

  it("aggregates across multiple categories", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));
    await upsertRunRank(db, OWNER_USER_ID, "marathon", baseRunRankUpsert({ tier: "elite", division: 3, lp: 50 }));

    const result = await getOverallRunnerRank(db, OWNER_USER_ID);

    expect(result.current).not.toBeNull();
  });
});
