import { describe, expect, it } from "vitest";
import { OWNER_USER_ID } from "@liftr/db";
import { registerRunRankRoutes } from "~server/routes/runRanks.js";
import { upsertRunRank, type RunRankUpsert } from "~server/repositories/runRankRepository.js";
import { createTestApp } from "../helpers/testApp.js";

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

describe("GET /api/runs/ranks", () => {
  it("returns an empty array when no run ranks have been computed", async () => {
    const { app, db } = createTestApp();
    registerRunRankRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/runs/ranks" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns every category rank for this user, sorted by lp descending", async () => {
    const { app, db } = createTestApp();
    registerRunRankRoutes(app, db);
    await upsertRunRank(db, OWNER_USER_ID,"5k", baseRunRankUpsert({ tier: "initiate", division: 5, lp: 10 }));
    await upsertRunRank(db, OWNER_USER_ID,"marathon", baseRunRankUpsert({ tier: "athlete", division: 1, lp: 90 }));

    const res = await app.inject({ method: "GET", url: "/api/runs/ranks" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body.map((r: { category: string }) => r.category)).toEqual(["marathon", "5k"]);
    expect(body[0]).toMatchObject({ category: "marathon", tier: "athlete", division: 1, lp: 90 });
    expect(body[1]).toMatchObject({ category: "5k", tier: "initiate", division: 5, lp: 10 });
  });
});
