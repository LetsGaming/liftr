import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, runStandards, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestUser } from "../helpers/testDb.js";
import { insertRun, insertRunPoints, type NewRun } from "~server/repositories/runRepository.js";
import {
  findAllRunPrs,
  findAllRunRanks,
  findBestRunPrByKind,
  findLoggedRunsForBucket,
  findRunRankByBucket,
  findRunStandardsForBucket,
  insertRunPr,
  insertRunRankEvent,
  upsertRunRank,
  type RunRankUpsert,
} from "~server/repositories/runRankRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function newRun(overrides: Partial<NewRun> = {}): NewRun {
  return {
    source: "gpx",
    activityType: "run",
    name: null,
    startedAt: new Date("2026-09-01T10:00:00Z"),
    clientId: `run-${Math.random().toString(36).slice(2, 8)}`,
    distanceM: 5000,
    durationS: 1500,
    avgPaceSPerKm: 300,
    ...overrides,
  };
}

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

describe("findRunStandardsForBucket", () => {
  async function insertStandard(category: "mile" | "5k" | "10k" | "half_marathon" | "marathon", sex: "male" | "female", threshold: number) {
    await db.insert(runStandards).values({ category, sex, tier: "initiate", division: 5, threshold, trust: "real" });
  }

  it("returns only standards for the requested category", async () => {
    await insertStandard("5k", "male", 3.5);
    await insertStandard("5k", "female", 3.0);
    await insertStandard("10k", "male", 3.2);

    const result = await findRunStandardsForBucket(db, "5k", "run");

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.category === "5k")).toBe(true);
  });

  it("returns an empty array when nothing has been ingested for that category", async () => {
    const result = await findRunStandardsForBucket(db, "marathon", "run");
    expect(result).toEqual([]);
  });
});

describe("findLoggedRunsForBucket", () => {
  it("returns all of a user's runs matching the nearest category when rankEligibleOnly is false", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-run", distanceM: 5000 }));
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "10k-run", distanceM: 10000 }));

    const result = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "run");

    expect(result.map((r) => r.clientId)).toEqual(["5k-run"]);
  });

  it("rankEligibleOnly excludes manual-source runs even if distance matches", async () => {
    const gpsRun = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-gps", distanceM: 5000, source: "gpx" }));
    await insertRunPoints(db, gpsRun.id, [{ idx: 0, t: 0, lat: 52.0, lon: 13.0 }]);
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-manual", distanceM: 5000, source: "manual" }));

    const result = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "run", { rankEligibleOnly: true });

    expect(result.map((r) => r.clientId)).toEqual(["5k-gps"]);
  });

  it("rankEligibleOnly excludes non-manual runs with no run_points rows", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-no-points", distanceM: 5000, source: "gpx" }));

    const result = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "run", { rankEligibleOnly: true });

    expect(result).toEqual([]);
  });

  it("filters by nearest category in application code, not by an exact distance match", async () => {
    // 4800m is closer to the 5k category distance (5000m) than to mile (1609.344m)
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "off-distance", distanceM: 4800 }));

    const result = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "run");

    expect(result.map((r) => r.clientId)).toEqual(["off-distance"]);
  });

  it("does not return another user's runs", async () => {
    const otherUser = await insertTestUser(db);
    await insertRun(db, otherUser.id, newRun({ clientId: "other-users-run", distanceM: 5000 }));

    const result = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "run");

    expect(result).toEqual([]);
  });
});

describe("upsertRunRank / findRunRankByBucket", () => {
  it("returns null when no rank has been computed yet", async () => {
    const result = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(result).toBeUndefined();
  });

  it("inserts a new rank row", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert());

    const result = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");

    expect(result?.tier).toBe("initiate");
    expect(result?.lp).toBe(10);
  });

  it("updates the existing row on conflict of (userId, category) rather than inserting a duplicate", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ lp: 10 }));
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ lp: 42, tier: "athlete" }));

    const result = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");

    expect(result?.lp).toBe(42);
    expect(result?.tier).toBe("athlete");

    const all = await findAllRunRanks(db, OWNER_USER_ID, "run");
    expect(all).toHaveLength(1);
  });

  it("keeps separate rows per category for the same user", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert());
    await upsertRunRank(db, OWNER_USER_ID, "10k", "run", baseRunRankUpsert({ tier: "trainee" }));

    expect((await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run"))?.tier).toBe("initiate");
    expect((await findRunRankByBucket(db, OWNER_USER_ID, "10k", "run"))?.tier).toBe("trainee");
  });

  it("does not leak another user's rank row", async () => {
    const otherUser = await insertTestUser(db);
    await upsertRunRank(db, otherUser.id, "5k", "run", baseRunRankUpsert());

    const result = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(result).toBeUndefined();
  });
});

describe("findAllRunRanks", () => {
  it("returns an empty array when nothing has been computed", async () => {
    expect(await findAllRunRanks(db, OWNER_USER_ID, "run")).toEqual([]);
  });

  it("returns every category rank for this user", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert());
    await upsertRunRank(db, OWNER_USER_ID, "marathon", "run", baseRunRankUpsert({ tier: "elite" }));

    const result = await findAllRunRanks(db, OWNER_USER_ID, "run");

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.category).sort()).toEqual(["5k", "marathon"]);
  });
});

describe("insertRunPr / findBestRunPrByKind", () => {
  it("returns undefined when no PR exists for that kind", async () => {
    const result = await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "run", "time");
    expect(result).toBeUndefined();
  });

  it("returns the highest-value PR row for the given category+kind", async () => {
    const run1 = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "pr-run-1" }));
    const run2 = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "pr-run-2" }));

    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "speed",
      value: 3.5,
      runId: run1.id,
      achievedAt: new Date("2026-08-01T00:00:00Z"),
    });
    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "speed",
      value: 4.1,
      runId: run2.id,
      achievedAt: new Date("2026-08-15T00:00:00Z"),
    });

    const result = await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "run", "speed");

    expect(result?.value).toBe(4.1);
    expect(result?.runId).toBe(run2.id);
  });

  it("does not mix PRs across kinds or categories", async () => {
    const run = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "pr-run-3" }));
    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "time",
      value: 1500,
      runId: run.id,
      achievedAt: new Date("2026-08-01T00:00:00Z"),
    });

    expect(await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "run", "speed")).toBeUndefined();
    expect(await findBestRunPrByKind(db, OWNER_USER_ID, "10k", "run", "time")).toBeUndefined();
  });

  it("does not leak another user's PR", async () => {
    const otherUser = await insertTestUser(db);
    const run = await insertRun(db, otherUser.id, newRun({ clientId: "pr-run-other" }));
    await insertRunPr(db, otherUser.id, {
      category: "5k",
      kind: "time",
      value: 1500,
      runId: run.id,
      achievedAt: new Date("2026-08-01T00:00:00Z"),
    });

    const result = await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "run", "time");
    expect(result).toBeUndefined();
  });
});

describe("findAllRunPrs", () => {
  it("returns an empty array when no run PRs exist yet", async () => {
    expect(await findAllRunPrs(db, OWNER_USER_ID)).toEqual([]);
  });

  it("returns every PR row for this user across categories and kinds, newest first", async () => {
    const run = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "all-prs-run" }));
    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "speed",
      value: 3.5,
      runId: run.id,
      achievedAt: new Date("2026-08-01T00:00:00Z"),
    });
    await insertRunPr(db, OWNER_USER_ID, {
      category: "10k",
      kind: "time",
      value: 2500,
      runId: run.id,
      achievedAt: new Date("2026-09-01T00:00:00Z"),
    });

    const result = await findAllRunPrs(db, OWNER_USER_ID);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.category)).toEqual(["10k", "5k"]);
  });

  it("does not leak another user's run PR", async () => {
    const otherUser = await insertTestUser(db);
    const run = await insertRun(db, otherUser.id, newRun({ clientId: "all-prs-other" }));
    await insertRunPr(db, otherUser.id, {
      category: "5k",
      kind: "speed",
      value: 3.5,
      runId: run.id,
      achievedAt: new Date("2026-08-01T00:00:00Z"),
    });

    expect(await findAllRunPrs(db, OWNER_USER_ID)).toEqual([]);
  });
});

describe("insertRunRankEvent", () => {
  it("inserts a rank-up event row without throwing", async () => {
    await expect(
      insertRunRankEvent(db, OWNER_USER_ID, {
        category: "5k",
        tier: "athlete",
        division: 3,
        occurredAt: new Date("2026-08-20T00:00:00Z"),
        plausibilityReason: null,
      }),
    ).resolves.not.toThrow();
  });

  it("scopes the event row to the given user (real FK-backed second user)", async () => {
    const otherUser = await insertTestUser(db);

    await expect(
      insertRunRankEvent(db, otherUser.id, {
        category: "10k",
        tier: "trainee",
        division: 2,
        occurredAt: new Date("2026-08-21T00:00:00Z"),
        plausibilityReason: "sustained_speed",
      }),
    ).resolves.not.toThrow();
  });
});

describe("activityType isolation (run vs walk ladders never leak into each other)", () => {
  it("findLoggedRunsForBucket: a walk is invisible to a 'run' query and vice versa", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ activityType: "run", distanceM: 5000, durationS: 1500 }));
    await insertRun(db, OWNER_USER_ID, newRun({ activityType: "walk", distanceM: 5000, durationS: 3000 }));

    const runRows = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "run");
    const walkRows = await findLoggedRunsForBucket(db, OWNER_USER_ID, "5k", "walk");

    expect(runRows).toHaveLength(1);
    expect(runRows[0]!.activityType).toBe("run");
    expect(walkRows).toHaveLength(1);
    expect(walkRows[0]!.activityType).toBe("walk");
  });

  it("findRunRankByBucket: a walk rank row is invisible to a 'run' query and vice versa", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert({ tier: "athlete" }));
    await upsertRunRank(db, OWNER_USER_ID, "5k", "walk", baseRunRankUpsert({ tier: "initiate" }));

    expect((await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run"))?.tier).toBe("athlete");
    expect((await findRunRankByBucket(db, OWNER_USER_ID, "5k", "walk"))?.tier).toBe("initiate");
  });

  it("findAllRunRanks: scoped to one activity type, not both", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", "run", baseRunRankUpsert());
    await upsertRunRank(db, OWNER_USER_ID, "10k", "run", baseRunRankUpsert());
    await upsertRunRank(db, OWNER_USER_ID, "5k", "walk", baseRunRankUpsert());

    const runRanks = await findAllRunRanks(db, OWNER_USER_ID, "run");
    const walkRanks = await findAllRunRanks(db, OWNER_USER_ID, "walk");

    expect(runRanks).toHaveLength(2);
    expect(walkRanks).toHaveLength(1);
  });

  it("findBestRunPrByKind: a walk PR is invisible to a 'run' query and vice versa", async () => {
    await insertRunPr(db, OWNER_USER_ID, {
      activityType: "run",
      category: "5k",
      kind: "speed",
      value: 4.0,
      runId: (await insertRun(db, OWNER_USER_ID, newRun({ activityType: "run" }))).id,
      achievedAt: new Date("2026-09-01T00:00:00Z"),
    });
    await insertRunPr(db, OWNER_USER_ID, {
      activityType: "walk",
      category: "5k",
      kind: "speed",
      value: 1.4,
      runId: (await insertRun(db, OWNER_USER_ID, newRun({ activityType: "walk" }))).id,
      achievedAt: new Date("2026-09-01T00:00:00Z"),
    });

    expect((await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "run", "speed"))?.value).toBeCloseTo(4.0, 5);
    expect((await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "walk", "speed"))?.value).toBeCloseTo(1.4, 5);
  });

  it("findAllRunPrs: omitting activityType returns both ladders' PRs together", async () => {
    const runId1 = (await insertRun(db, OWNER_USER_ID, newRun({ activityType: "run" }))).id;
    const runId2 = (await insertRun(db, OWNER_USER_ID, newRun({ activityType: "walk" }))).id;
    await insertRunPr(db, OWNER_USER_ID, {
      activityType: "run",
      category: "5k",
      kind: "speed",
      value: 4.0,
      runId: runId1,
      achievedAt: new Date("2026-09-01T00:00:00Z"),
    });
    await insertRunPr(db, OWNER_USER_ID, {
      activityType: "walk",
      category: "5k",
      kind: "speed",
      value: 1.4,
      runId: runId2,
      achievedAt: new Date("2026-09-02T00:00:00Z"),
    });

    const both = await findAllRunPrs(db, OWNER_USER_ID);
    expect(both).toHaveLength(2);
    const onlyRun = await findAllRunPrs(db, OWNER_USER_ID, "run");
    expect(onlyRun).toHaveLength(1);
    expect(onlyRun[0]!.activityType).toBe("run");
  });
});
