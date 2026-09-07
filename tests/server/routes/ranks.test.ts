import { describe, expect, it } from "vitest";
import { ranks } from "@liftr/db";
import { registerRankRoutes } from "~server/routes/ranks.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

describe("GET /api/ranks", () => {
  it("returns an empty array when no ranks have been computed", async () => {
    const { app, db } = createTestApp();
    registerRankRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/ranks" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns each rank joined to its exercise, sorted by lp descending", async () => {
    const { app, db } = createTestApp();
    registerRankRoutes(app, db);
    const weak = await insertTestExercise(db, { slug: "weak-exercise" });
    const strong = await insertTestExercise(db, { slug: "strong-exercise", name: "Strong Custom" });
    await db.insert(ranks).values([
      {
        exerciseId: weak.id,
        tier: "initiate",
        division: 3,
        lp: 10,
        e1rm: 50,
        trust: "real",
        nextTargetWeightKg: 55,
        nextTargetReps: 5,
        computedAt: new Date(),
        peakTier: "initiate",
        peakDivision: 3,
        peakLp: 10,
        peakE1rm: 50,
        peakAchievedAt: new Date(),
      },
      {
        exerciseId: strong.id,
        tier: "athlete",
        division: 1,
        lp: 90,
        e1rm: 150,
        trust: "real",
        nextTargetWeightKg: null,
        nextTargetReps: null,
        computedAt: new Date(),
        peakTier: null,
        peakDivision: null,
        peakLp: null,
        peakE1rm: null,
        peakAchievedAt: null,
      },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/ranks" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body.map((r: { slug: string }) => r.slug)).toEqual(["strong-exercise", "weak-exercise"]);
    expect(body[0]).toMatchObject({
      exerciseId: strong.id,
      name: "Strong Custom",
      tier: "athlete",
      division: 1,
      lp: 90,
      peakTier: null,
      peakDivision: null,
    });
    expect(body[1]).toMatchObject({ exerciseId: weak.id, tier: "initiate", peakTier: "initiate", peakDivision: 3 });
  });
});
