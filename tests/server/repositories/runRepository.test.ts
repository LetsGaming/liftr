import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import {
  deleteRun,
  findRecentRuns,
  findRunByClientId,
  findRunById,
  findRunPoints,
  insertRun,
  insertRunPoints,
  type NewRun,
} from "~server/repositories/runRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function newRun(overrides: Partial<NewRun> = {}): NewRun {
  return {
    source: "manual",
    name: null,
    startedAt: new Date("2026-09-01T10:00:00Z"),
    clientId: `run-${Math.random().toString(36).slice(2, 8)}`,
    distanceM: 5000,
    durationS: 1500,
    avgPaceSPerKm: 300,
    ...overrides,
  };
}

describe("insertRun", () => {
  it("creates and returns the new run row", async () => {
    const row = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r1", distanceM: 10000 }));

    expect(row.clientId).toBe("r1");
    expect(row.distanceM).toBe(10000);
    expect(row.source).toBe("manual");
  });
});

describe("findRecentRuns", () => {
  it("orders runs by startedAt descending", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-earlier", startedAt: new Date("2026-09-01T10:00:00Z") }));
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-later", startedAt: new Date("2026-09-05T10:00:00Z") }));

    const result = await findRecentRuns(db, OWNER_USER_ID);

    expect(result.map((r) => r.clientId)).toEqual(["r-later", "r-earlier"]);
  });

  it("respects the limit argument", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r1", startedAt: new Date("2026-09-01T10:00:00Z") }));
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r2", startedAt: new Date("2026-09-02T10:00:00Z") }));
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r3", startedAt: new Date("2026-09-03T10:00:00Z") }));

    const result = await findRecentRuns(db, OWNER_USER_ID, 2);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.clientId)).toEqual(["r3", "r2"]);
  });

  it("returns an empty array when there are no runs", async () => {
    const result = await findRecentRuns(db, OWNER_USER_ID);
    expect(result).toEqual([]);
  });
});

describe("findRunById", () => {
  it("returns the matching run", async () => {
    const row = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-by-id" }));

    const result = await findRunById(db, OWNER_USER_ID, row.id);

    expect(result?.id).toBe(row.id);
  });

  it("returns undefined for an unknown id", async () => {
    const result = await findRunById(db, OWNER_USER_ID, "nonexistent-id");
    expect(result).toBeUndefined();
  });
});

describe("findRunByClientId", () => {
  it("returns the run matching the given clientId", async () => {
    await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-client-1" }));

    const result = await findRunByClientId(db, OWNER_USER_ID, "r-client-1");

    expect(result?.clientId).toBe("r-client-1");
  });

  it("returns undefined when no run has that clientId", async () => {
    const result = await findRunByClientId(db, OWNER_USER_ID, "nonexistent-client-id");
    expect(result).toBeUndefined();
  });
});

describe("deleteRun", () => {
  it("removes the run so it can no longer be found", async () => {
    const row = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-to-delete" }));

    await deleteRun(db, OWNER_USER_ID, row.id);

    const result = await findRunById(db, OWNER_USER_ID, row.id);
    expect(result).toBeUndefined();
  });
});

describe("insertRunPoints and findRunPoints", () => {
  it("inserts points and returns them ordered by idx", async () => {
    const run = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-points" }));

    await insertRunPoints(db, run.id, [
      { idx: 1, t: 1000, lat: 52.1, lon: 13.1 },
      { idx: 0, t: 0, lat: 52.0, lon: 13.0, ele: 34, hr: 140, cadence: 80 },
    ]);

    const result = await findRunPoints(db, run.id);

    expect(result.map((p) => p.idx)).toEqual([0, 1]);
    expect(result[0]!.lat).toBe(52.0);
    expect(result[0]!.ele).toBe(34);
    expect(result[0]!.hr).toBe(140);
    expect(result[0]!.cadence).toBe(80);
  });

  it("defaults optional ele/hr/cadence to null when not given", async () => {
    const run = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-points-minimal" }));

    await insertRunPoints(db, run.id, [{ idx: 0, t: 0, lat: 52.0, lon: 13.0 }]);

    const result = await findRunPoints(db, run.id);

    expect(result[0]!.ele).toBeNull();
    expect(result[0]!.hr).toBeNull();
    expect(result[0]!.cadence).toBeNull();
  });

  it("is a no-op when given an empty points array", async () => {
    const run = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-no-points" }));

    await insertRunPoints(db, run.id, []);

    const result = await findRunPoints(db, run.id);
    expect(result).toEqual([]);
  });

  it("cascades point deletion when the parent run is deleted", async () => {
    const run = await insertRun(db, OWNER_USER_ID, newRun({ clientId: "r-cascade" }));
    await insertRunPoints(db, run.id, [{ idx: 0, t: 0, lat: 52.0, lon: 13.0 }]);

    await deleteRun(db, OWNER_USER_ID, run.id);

    const result = await findRunPoints(db, run.id);
    expect(result).toEqual([]);
  });
});
