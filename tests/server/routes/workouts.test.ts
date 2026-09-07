import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { prs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { registerWorkoutRoutes } from "~server/routes/workouts.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

describe("workout routes", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let db: LiftrDb;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    registerWorkoutRoutes(app, db);
  });

  describe("POST /api/workouts", () => {
    it("starts a new workout session and snapshots its exercise order", async () => {
      const exercise = await insertTestExercise(db);
      const res = await app.inject({
        method: "POST",
        url: "/api/workouts",
        payload: {
          clientId: "client-workout-1",
          startedAt: "2026-01-01T10:00:00Z",
          exerciseIds: [exercise.id],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({ clientId: "client-workout-1" });

      const rows = await db.query.workoutExercises.findMany({ where: eq(workoutExercises.workoutId, body.id) });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.exerciseId).toBe(exercise.id);
    });

    it("is idempotent on clientId — replaying the same start returns the existing workout without a second insert", async () => {
      const payload = { clientId: "client-workout-2", startedAt: "2026-01-01T10:00:00Z", exerciseIds: [] };
      const first = await app.inject({ method: "POST", url: "/api/workouts", payload });
      const second = await app.inject({ method: "POST", url: "/api/workouts", payload });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(second.json().id).toBe(first.json().id);

      const rows = await db.query.workouts.findMany({ where: eq(workouts.clientId, "client-workout-2") });
      expect(rows).toHaveLength(1);
    });

    it("rejects a body missing the required clientId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/workouts",
        payload: { startedAt: "2026-01-01T10:00:00Z" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  describe("PATCH /api/workouts/:id", () => {
    async function startWorkout(clientId = "client-patch-1") {
      const res = await app.inject({
        method: "POST",
        url: "/api/workouts",
        payload: { clientId, startedAt: "2026-01-01T10:00:00Z", exerciseIds: [] },
      });
      return res.json();
    }

    it("finishes a workout, persisting endedAt/pausedSeconds/notes", async () => {
      const workout = await startWorkout();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/workouts/${workout.id}`,
        payload: { endedAt: "2026-01-01T11:00:00Z", pausedSeconds: 30, notes: "felt strong" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      const row = await db.query.workouts.findFirst({ where: eq(workouts.id, workout.id) });
      expect(row?.pausedSeconds).toBe(30);
      expect(row?.notes).toBe("felt strong");
      expect(row?.endedAt).toBeInstanceOf(Date);
    });

    it("rejects a negative pausedSeconds", async () => {
      const workout = await startWorkout("client-patch-2");
      const res = await app.inject({
        method: "PATCH",
        url: `/api/workouts/${workout.id}`,
        payload: { pausedSeconds: -1 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  describe("GET /api/workouts/:id", () => {
    it("returns 404 for an unknown workout", async () => {
      const res = await app.inject({ method: "GET", url: "/api/workouts/does-not-exist" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("returns full workout detail with a per-set isPr flag", async () => {
      const exercise = await insertTestExercise(db);
      const [workout] = await db
        .insert(workouts)
        .values({ clientId: "client-detail-1", startedAt: new Date("2026-01-01T10:00:00Z"), pausedSeconds: 0 })
        .returning();
      const [we] = await db
        .insert(workoutExercises)
        .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
        .returning();
      const [prSet] = await db
        .insert(sets)
        .values({
          workoutExerciseId: we!.id,
          setIndex: 0,
          weightKg: 100,
          reps: 5,
          loggedAt: new Date("2026-01-01T10:05:00Z"),
          clientId: "set-pr",
        })
        .returning();
      const [plainSet] = await db
        .insert(sets)
        .values({
          workoutExerciseId: we!.id,
          setIndex: 1,
          weightKg: 80,
          reps: 5,
          loggedAt: new Date("2026-01-01T10:10:00Z"),
          clientId: "set-plain",
        })
        .returning();
      await db.insert(prs).values({ exerciseId: exercise.id, kind: "weight", value: 100, setId: prSet!.id, achievedAt: new Date() });

      const res = await app.inject({ method: "GET", url: `/api/workouts/${workout!.id}` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(workout!.id);
      const setsById = new Map(body.workoutExercises[0].sets.map((s: { id: string; isPr: boolean }) => [s.id, s.isPr]));
      expect(setsById.get(prSet!.id)).toBe(true);
      expect(setsById.get(plainSet!.id)).toBe(false);
    });
  });

  describe("DELETE /api/workouts/:id", () => {
    it("returns 404 for an unknown workout", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/workouts/does-not-exist" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("deletes an existing workout and cascades its exercises", async () => {
      const exercise = await insertTestExercise(db);
      const [workout] = await db
        .insert(workouts)
        .values({ clientId: "client-delete-1", startedAt: new Date("2026-01-01T10:00:00Z"), pausedSeconds: 0 })
        .returning();
      await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 });

      const res = await app.inject({ method: "DELETE", url: `/api/workouts/${workout!.id}` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      const row = await db.query.workouts.findFirst({ where: eq(workouts.id, workout!.id) });
      expect(row).toBeUndefined();
    });
  });
});
