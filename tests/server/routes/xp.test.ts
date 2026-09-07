import { beforeEach, describe, expect, it } from "vitest";
import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { registerXpRoutes } from "~server/routes/xp.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

describe("GET /api/xp", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let db: LiftrDb;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    registerXpRoutes(app, db);
  });

  it("returns a zeroed-out summary when nothing has been logged", async () => {
    const res = await app.inject({ method: "GET", url: "/api/xp" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ totalXp: 0, level: 0, xpIntoLevel: 0, progressPercent: 0 });
    expect(typeof body.xpForNextLevel).toBe("number");
    expect(body.xpForNextLevel).toBeGreaterThan(0);
  });

  it("sums XP across logged non-warmup sets and reports a positive level progression", async () => {
    const exercise = await insertTestExercise(db);
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "w-1", startedAt: new Date("2026-01-01T10:00:00Z"), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values([
      {
        workoutExerciseId: we!.id,
        setIndex: 0,
        weightKg: 60,
        reps: 8,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date("2026-01-01T10:05:00Z"),
        clientId: "set-1",
      },
      // Warmup sets never count toward XP.
      {
        workoutExerciseId: we!.id,
        setIndex: 1,
        weightKg: 20,
        reps: 10,
        kind: "warmup",
        isWarmup: true,
        loggedAt: new Date("2026-01-01T10:00:00Z"),
        clientId: "set-2",
      },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/xp" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalXp).toBeGreaterThan(0);
    expect(typeof body.level).toBe("number");
  });
});
