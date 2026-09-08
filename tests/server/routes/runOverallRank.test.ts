import { describe, expect, it } from "vitest";
import { OWNER_USER_ID } from "@liftr/db";
import { registerOverallRunnerRankRoutes } from "~server/routes/runOverallRank.js";
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

describe("GET /api/runs/overall-rank", () => {
  it("returns null current/peak when nothing has been ranked yet", async () => {
    const { app, db } = createTestApp();
    registerOverallRunnerRankRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/runs/overall-rank" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ current: null, peak: null });
  });

  it("returns the aggregated current band once a category has a computed rank", async () => {
    const { app, db } = createTestApp();
    registerOverallRunnerRankRoutes(app, db);
    await upsertRunRank(db, OWNER_USER_ID, "5k", baseRunRankUpsert({ tier: "athlete", division: 3, lp: 50 }));

    const res = await app.inject({ method: "GET", url: "/api/runs/overall-rank" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current).toMatchObject({ tier: "athlete" });
    expect(body.peak).toBeNull();
  });
});
