import { describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, sets, workoutExercises, workouts } from "@liftr/db";
import { registerReadinessRoutes } from "~server/routes/readiness.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

describe("GET /api/readiness", () => {
  it("returns every muscle with lastTrainedAt null when nothing has been logged", async () => {
    const { app, db } = await createTestApp();
    registerReadinessRoutes(app, db);
    await db.insert(muscles).values({ slug: "chest", svgRegionKey: "mb-chest" });

    const res = await app.inject({ method: "GET", url: "/api/readiness" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ slug: "chest", lastTrainedAt: null, wasPrimary: true }]);
  });

  it("reports the most recent set that touched a muscle, and whether it was primary", async () => {
    const { app, db } = await createTestApp();
    registerReadinessRoutes(app, db);
    const [chest] = await db.insert(muscles).values({ slug: "chest", svgRegionKey: "mb-chest" }).returning();
    const exercise = await insertTestExercise(db, { slug: "bench-press" });
    await db.insert(exerciseMuscles).values({ exerciseId: exercise.id, muscleId: chest!.id, role: "primary" });
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "w-1", startedAt: new Date(), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    const loggedAt = new Date("2026-09-01T10:00:00Z");
    await db.insert(sets).values({
      workoutExerciseId: we!.id,
      setIndex: 0,
      weightKg: 60,
      reps: 8,
      kind: "normal",
      isWarmup: false,
      loggedAt,
      clientId: "s-1",
    });

    const res = await app.inject({ method: "GET", url: "/api/readiness" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ slug: "chest", lastTrainedAt: loggedAt.toISOString(), wasPrimary: true }]);
  });

  // The secondary-role (wasPrimary: false) case is `readinessService`'s own logic, not this
  // route's — covered by tests/server/services/readinessService.test.ts, which this thin route
  // wraps. This route's job is HTTP status + the Zod response shape, already pinned above.
});
