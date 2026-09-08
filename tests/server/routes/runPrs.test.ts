import { describe, expect, it } from "vitest";
import { OWNER_USER_ID } from "@liftr/db";
import { registerRunPrRoutes } from "~server/routes/runPrs.js";
import { insertRun } from "~server/repositories/runRepository.js";
import { insertRunPr } from "~server/repositories/runRankRepository.js";
import { createTestApp } from "../helpers/testApp.js";

describe("GET /api/runs/prs", () => {
  it("returns an empty array when no run PRs exist yet", async () => {
    const { app, db } = createTestApp();
    registerRunPrRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/runs/prs" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns a run PR with its category/kind/value and originating run id", async () => {
    const { app, db } = createTestApp();
    registerRunPrRoutes(app, db);
    const run = await insertRun(db, OWNER_USER_ID, {
      source: "gpx",
      name: null,
      startedAt: new Date("2026-09-01T10:00:00Z"),
      clientId: "run-prs-1",
      distanceM: 5000,
      durationS: 1500,
      avgPaceSPerKm: 300,
    });
    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "speed",
      value: 3.5,
      runId: run.id,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const res = await app.inject({ method: "GET", url: "/api/runs/prs" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      category: "5k",
      kind: "speed",
      value: 3.5,
      runId: run.id,
    });
    expect(body[0].achievedAt).toBe(new Date("2026-09-01T10:00:00Z").toISOString());
  });

  it("sorts newest-first", async () => {
    const { app, db } = createTestApp();
    registerRunPrRoutes(app, db);
    const run = await insertRun(db, OWNER_USER_ID, {
      source: "gpx",
      name: null,
      startedAt: new Date("2026-08-01T10:00:00Z"),
      clientId: "run-prs-2",
      distanceM: 5000,
      durationS: 1500,
      avgPaceSPerKm: 300,
    });
    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "speed",
      value: 3.0,
      runId: run.id,
      achievedAt: new Date("2026-08-01T00:00:00Z"),
    });
    await insertRunPr(db, OWNER_USER_ID, {
      category: "5k",
      kind: "speed",
      value: 3.5,
      runId: run.id,
      achievedAt: new Date("2026-09-01T00:00:00Z"),
    });

    const res = await app.inject({ method: "GET", url: "/api/runs/prs" });

    expect(res.json().map((r: { value: number }) => r.value)).toEqual([3.5, 3.0]);
  });
});
