import { describe, expect, it } from "vitest";
import { prs, sets, workoutExercises, workouts } from "@liftr/db";
import { registerPrRoutes } from "~server/routes/prs.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

describe("GET /api/prs", () => {
  it("returns an empty array when no PRs exist yet", async () => {
    const { app, db } = createTestApp();
    registerPrRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/prs" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns a PR joined to its exercise slug/name and originating workout", async () => {
    const { app, db } = createTestApp();
    registerPrRoutes(app, db);
    const exercise = await insertTestExercise(db, { slug: "bench-press" });
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "w-1", startedAt: new Date(), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    const [set] = await db
      .insert(sets)
      .values({
        workoutExerciseId: we!.id,
        setIndex: 0,
        weightKg: 100,
        reps: 5,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date(),
        clientId: "s-1",
      })
      .returning();
    await db.insert(prs).values({
      exerciseId: exercise.id,
      kind: "weight",
      value: 100,
      setId: set!.id,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const res = await app.inject({ method: "GET", url: "/api/prs" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      exerciseSlug: "bench-press",
      exerciseName: null,
      kind: "weight",
      value: 100,
      workoutId: workout!.id,
    });
    expect(body[0].achievedAt).toBe(new Date("2026-09-01T10:00:00Z").toISOString());
  });

  it("returns workoutId null when the originating set no longer exists", async () => {
    const { app, db } = createTestApp();
    registerPrRoutes(app, db);
    const exercise = await insertTestExercise(db);
    await db.insert(prs).values({
      exerciseId: exercise.id,
      kind: "e1rm",
      value: 120,
      setId: null,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const res = await app.inject({ method: "GET", url: "/api/prs" });

    expect(res.json()[0].workoutId).toBeNull();
  });

  it("sorts newest-first", async () => {
    const { app, db } = createTestApp();
    registerPrRoutes(app, db);
    const exercise = await insertTestExercise(db);
    await db.insert(prs).values([
      { exerciseId: exercise.id, kind: "weight", value: 80, setId: null, achievedAt: new Date("2026-08-01T00:00:00Z") },
      { exerciseId: exercise.id, kind: "weight", value: 90, setId: null, achievedAt: new Date("2026-09-01T00:00:00Z") },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/prs" });

    expect(res.json().map((r: { value: number }) => r.value)).toEqual([90, 80]);
  });
});
