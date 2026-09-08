import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, runStandards, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestUser } from "../helpers/testDb.js";
import { insertRun, insertRunPoints, type NewRun } from "~server/repositories/runRepository.js";
import {
  findAllRunRanks,
  findBestRunPrByKind,
  findLoggedRunsForCategory,
  findRunRankByCategory,
  findRunStandardsForCategory,
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

describe("findRunStandardsForCategory", () => {
  async function insertStandard(category: "mile" | "5k" | "10k" | "half_marathon" | "marathon", sex: "male" | "female", threshold: number) {
    await db.insert(runStandards).values({ category, sex, tier: "initiate", division: 5, threshold, trust: "real" });
  }

  it("returns only standards for the requested category", async () => {
    await insertStandard("5k", "male", 3.5);
    await insertStandard("5k", "female", 3.0);
    await insertStandard("10k", "male", 3.2);

    const result = await findRunStandardsForCategory(db, "5k");

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.category === "5k")).toBe(true);
  });

  it("returns an empty array when nothing has been ingested for that category", async () => {
    const result = await findRunStandardsForCategory(db, "marathon");
    expect(result).toEqual([]);
  });
});

describe("findLoggedRunsForCategory", () => {
  it("returns all of a user's runs matching the nearest category when rankEligibleOnly is false", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-run", distanceM: 5000 }));
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "10k-run", distanceM: 10000 }));

    const result = await findLoggedRunsForCategory(db, OWNER_USER_ID, "5k");

    expect(result.map((r) => r.clientId)).toEqual(["5k-run"]);
  });

  it("rankEligibleOnly excludes manual-source runs even if distance matches", async () => {
    const gpsRun = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-gps", distanceM: 5000, source: "gpx" }));
    await insertRunPoints(db, gpsRun.id, [{ idx: 0, t: 0, lat: 52.0, lon: 13.0 }]);
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-manual", distanceM: 5000, source: "manual" }));

    const result = await findLoggedRunsForCategory(db, OWNER_USER_ID, "5k", { rankEligibleOnly: true });

    expect(result.map((r) => r.clientId)).toEqual(["5k-gps"]);
  });

  it("rankEligibleOnly excludes non-manual runs with no run_points rows", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "5k-no-points", distanceM: 5000, source: "gpx" }));

    const result = await findLoggedRunsForCategory(db, OWNER_USER_ID, "5k", { rankEligibleOnly: true });

    expect(result).toEqual([]);
  });

  it("filters by nearest category in application code, not by an exact distance match", async () => {
    // 4800m is closer to the 5k category distance (5000m) than to mile (1609.344m)
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "off-distance", distanceM: 4800 }));

    const result = await findLoggedRunsForCategory(db, OWNER_USER_ID, "5k");

    expect(result.map((r) => r.clientId)).toEqual(["off-distance"]);
  });

  it("does not return another user's runs", async () => {
    const otherUser = await insertTestUser(db);
    await insertRun(db, otherUser.id, newRun({ clientId: "other-users-run", distanceM: 5000 }));

    const result = await findLoggedRunsForCategory(db, OWNER_USER_ID, "5k");

    expect(result).toEqual([]);
  });
});

describe("upsertRunRank / findRunRankByCategory", () => {
  it("returns null when no rank has been computed yet", async () => {
    const result = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
    expect(result).toBeUndefined();
  });

  it("inserts a new rank row", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert());

    const result = await findRunRankByCategory(db, OWNER_USER_ID, "5k");

    expect(result?.tier).toBe("initiate");
    expect(result?.lp).toBe(10);
  });

  it("updates the existing row on conflict of (userId, category) rather than inserting a duplicate", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert({ lp: 10 }));
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert({ lp: 42, tier: "athlete" }));

    const result = await findRunRankByCategory(db, OWNER_USER_ID, "5k");

    expect(result?.lp).toBe(42);
    expect(result?.tier).toBe("athlete");

    const all = await findAllRunRanks(db, OWNER_USER_ID);
    expect(all).toHaveLength(1);
  });

  it("keeps separate rows per category for the same user", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert());
    await upsertRunRank(db, OWNER_USER_ID, "10k", baseRunRankUpsert({ tier: "trainee" }));

    expect((await findRunRankByCategory(db, OWNER_USER_ID, "5k"))?.tier).toBe("initiate");
    expect((await findRunRankByCategory(db, OWNER_USER_ID, "10k"))?.tier).toBe("trainee");
  });

  it("does not leak another user's rank row", async () => {
    const otherUser = await insertTestUser(db);
    await upsertRunRank(db, otherUser.id, "5k", baseRunRankUpsert());

    const result = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
    expect(result).toBeUndefined();
  });
});

describe("findAllRunRanks", () => {
  it("returns an empty array when nothing has been computed", async () => {
    expect(await findAllRunRanks(db, OWNER_USER_ID)).toEqual([]);
  });

  it("returns every category rank for this user", async () => {
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert());
    await upsertRunRank(db, OWNER_USER_ID, "marathon", baseRunRankUpsert({ tier: "elite" }));

    const result = await findAllRunRanks(db, OWNER_USER_ID);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.category).sort()).toEqual(["5k", "marathon"]);
  });
});

describe("insertRunPr / findBestRunPrByKind", () => {
  it("returns undefined when no PR exists for that kind", async () => {
    const result = await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "time");
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

    const result = await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "speed");

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

    expect(await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "speed")).toBeUndefined();
    expect(await findBestRunPrByKind(db, OWNER_USER_ID, "10k", "time")).toBeUndefined();
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

    const result = await findBestRunPrByKind(db, OWNER_USER_ID, "5k", "time");
    expect(result).toBeUndefined();
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
