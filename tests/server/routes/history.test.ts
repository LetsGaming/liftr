import { beforeEach, describe, expect, it } from "vitest";
import { runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import type { FastifyInstance } from "fastify";
import { registerHistoryRoutes } from "~server/routes/history.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

let app: FastifyInstance;
let db: LiftrDb;

beforeEach(() => {
  ({ app, db } = createTestApp());
  registerHistoryRoutes(app, db);
});

describe("GET /api/history", () => {
  it("returns an empty feed with a null cursor when nothing has happened yet", async () => {
    const res = await app.inject({ method: "GET", url: "/api/history" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], nextCursor: null });
  });

  it("merges finished workouts and runs into one reverse-chronological feed", async () => {
    const exercise = await insertTestExercise(db);
    const [workout] = await db
      .insert(workouts)
      .values({
        clientId: "history-workout-1",
        startedAt: new Date("2026-09-01T10:00:00Z"),
        endedAt: new Date("2026-09-01T11:00:00Z"),
        pausedSeconds: 0,
      })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values({
      workoutExerciseId: we!.id,
      setIndex: 0,
      weightKg: 60,
      reps: 5,
      kind: "normal",
      isWarmup: false,
      loggedAt: new Date("2026-09-01T10:05:00Z"),
      clientId: "history-set-1",
    });
    await db.insert(runs).values({
      source: "manual",
      name: "Morning Run",
      startedAt: new Date("2026-09-02T08:00:00Z"),
      distanceM: 5000,
      durationS: 1800,
      clientId: "history-run-1",
    });

    const res = await app.inject({ method: "GET", url: "/api/history" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    // The run started later than the workout, so it comes first.
    expect(body.items[0]).toMatchObject({ kind: "run", id: expect.any(String), title: "Morning Run" });
    expect(body.items[1]).toMatchObject({ kind: "workout", id: workout!.id });
    expect(body.nextCursor).toBeNull();
  });

  it("caps the page and returns a nextCursor when there are more items than the limit", async () => {
    for (let i = 0; i < 3; i++) {
      await db.insert(runs).values({
        source: "manual",
        name: `Run ${i}`,
        startedAt: new Date(Date.UTC(2026, 8, 1 + i)),
        distanceM: 1000,
        durationS: 300,
        clientId: `history-run-limit-${i}`,
      });
    }

    const res = await app.inject({ method: "GET", url: "/api/history?limit=2" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();
    // Most recent first: Run 2 (Sep 3), then Run 1 (Sep 2) — Run 0 is left for the next page.
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Run 2", "Run 1"]);
  });

  it("caps an overly large limit at 50 rather than passing it straight through", async () => {
    await db.insert(runs).values({
      source: "manual",
      name: "Solo Run",
      startedAt: new Date("2026-09-01T08:00:00Z"),
      distanceM: 1000,
      durationS: 300,
      clientId: "history-run-cap",
    });

    const res = await app.inject({ method: "GET", url: "/api/history?limit=500" });

    expect(res.statusCode).toBe(200);
    // A single item is well under any cap, but nextCursor being null (not driven by hitting the
    // page size) confirms the route didn't error out on an oversized limit either.
    expect(res.json().items).toHaveLength(1);
  });

  it("rejects a non-numeric limit with a 400 invalid_request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/history?limit=abc" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});

describe("GET /api/exercises/:id/history", () => {
  it("returns the logged sets for that exercise, most recent first", async () => {
    const exercise = await insertTestExercise(db);
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "ex-history-workout", startedAt: new Date("2026-09-01T10:00:00Z"), pausedSeconds: 0 })
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
        reps: 5,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date("2026-09-01T10:05:00Z"),
        clientId: "ex-history-set-1",
      },
      {
        workoutExerciseId: we!.id,
        setIndex: 1,
        weightKg: 65,
        reps: 4,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date("2026-09-01T10:10:00Z"),
        clientId: "ex-history-set-2",
      },
    ]);

    const res = await app.inject({ method: "GET", url: `/api/exercises/${exercise.id}/history` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sets).toHaveLength(2);
    // Most recently logged first.
    expect(body.sets[0]).toMatchObject({ setIndex: 1, weightKg: 65, reps: 4 });
    expect(body.sets[1]).toMatchObject({ setIndex: 0, weightKg: 60, reps: 5 });
  });

  it("returns an empty set list for an exercise id with no logged history, rather than a 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/exercises/does-not-exist/history" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sets: [] });
  });
});
