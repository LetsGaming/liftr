import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { registerSyncRoutes } from "~server/routes/sync.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

/**
 * HTTP-contract coverage only — see tests/server/services/syncService.test.ts for the exhaustive
 * per-item-type behavior (idempotency, plausibility, XP bonuses, ...) this route just wires up.
 */
describe("POST /api/sync", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let db: LiftrDb;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    registerSyncRoutes(app, db);
  });

  it("applies a valid batch and returns the service's per-item results", async () => {
    const exercise = await insertTestExercise(db);
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      payload: {
        items: [
          {
            clientId: "client-1",
            type: "start_workout",
            payload: {
              id: "workout-1",
              startedAt: "2026-01-01T10:00:00Z",
              exercises: [{ id: "we-1", exerciseId: exercise.id, orderIndex: 0 }],
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ clientId: "client-1", status: "created", serverId: "workout-1" });
  });

  it("applies multiple items in one batch, each surfaced in the results array", async () => {
    const exercise = await insertTestExercise(db);
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      payload: {
        items: [
          {
            clientId: "client-start",
            type: "start_workout",
            payload: {
              id: "workout-2",
              startedAt: "2026-01-01T10:00:00Z",
              exercises: [{ id: "we-2", exerciseId: exercise.id, orderIndex: 0 }],
            },
          },
          {
            clientId: "client-set",
            type: "log_set",
            payload: {
              workoutExerciseId: "we-2",
              setIndex: 0,
              weightKg: 60,
              reps: 8,
              loggedAt: "2026-01-01T10:05:00Z",
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results.map((r: { clientId: string }) => r.clientId)).toEqual(["client-start", "client-set"]);
  });

  it("rejects an empty items array", async () => {
    const res = await app.inject({ method: "POST", url: "/api/sync", payload: { items: [] } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a batch missing the items field entirely", async () => {
    const res = await app.inject({ method: "POST", url: "/api/sync", payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an item with an unrecognized type (discriminated union mismatch)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      payload: { items: [{ clientId: "client-1", type: "delete_everything", payload: {} }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a log_set item whose payload is missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      payload: {
        items: [
          {
            clientId: "client-1",
            type: "log_set",
            payload: { workoutExerciseId: "we-1", setIndex: 0, weightKg: 60 },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a batch over the 200-item cap", async () => {
    const exercise = await insertTestExercise(db);
    const items = Array.from({ length: 201 }, (_, i) => ({
      clientId: `client-${i}`,
      type: "start_workout" as const,
      payload: {
        id: `workout-${i}`,
        startedAt: "2026-01-01T10:00:00Z",
        exercises: [{ id: `we-${i}`, exerciseId: exercise.id, orderIndex: 0 }],
      },
    }));

    const res = await app.inject({ method: "POST", url: "/api/sync", payload: { items } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});
