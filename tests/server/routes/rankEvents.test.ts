import { describe, expect, it } from "vitest";
import { rankEvents } from "@liftr/db";
import { registerRankEventsRoutes } from "~server/routes/rankEvents.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

interface RankEventRow {
  weekday: number;
  count: number;
  flaggedCount: number;
}

describe("GET /api/rank-events", () => {
  it("returns all 7 weekdays, zero-filled, when nothing has happened", async () => {
    const { app, db } = createTestApp();
    registerRankEventsRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/rank-events" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as RankEventRow[];
    expect(body).toHaveLength(7);
    expect(body.every((r) => r.count === 0 && r.flaggedCount === 0)).toBe(true);
    expect(body.map((r) => r.weekday).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("counts rank-ups on today's weekday, splitting out plausibility-flagged ones", async () => {
    const { app, db } = createTestApp();
    registerRankEventsRoutes(app, db);
    const exercise = await insertTestExercise(db);
    const today = new Date();
    await db.insert(rankEvents).values([
      { exerciseId: exercise.id, tier: "apprentice", division: 3, occurredAt: today, plausibilityReason: null },
      { exerciseId: exercise.id, tier: "athlete", division: 3, occurredAt: today, plausibilityReason: "pace" },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/rank-events" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as RankEventRow[];
    const todayRow = body.find((r) => r.weekday === today.getDay())!;
    expect(todayRow.count).toBe(2);
    expect(todayRow.flaggedCount).toBe(1);
  });

  it("excludes rank events older than the 7-day rolling window", async () => {
    const { app, db } = createTestApp();
    registerRankEventsRoutes(app, db);
    const exercise = await insertTestExercise(db);
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.insert(rankEvents).values({ exerciseId: exercise.id, tier: "apprentice", division: 3, occurredAt: longAgo, plausibilityReason: null });

    const res = await app.inject({ method: "GET", url: "/api/rank-events" });

    const body = res.json() as RankEventRow[];
    expect(body.reduce((sum, r) => sum + r.count, 0)).toBe(0);
  });
});
