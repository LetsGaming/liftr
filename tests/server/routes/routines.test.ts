import { describe, expect, it } from "vitest";
import { mesocycles, routines } from "@liftr/db";
import { registerRoutineRoutes } from "~server/routes/routines.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

describe("GET /api/routines", () => {
  it("returns an empty array when there are no routines", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/routines" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns active routines with their exercises and active mesocycle, excluding archived ones", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const [active] = await db.insert(routines).values({ name: "Push Day", orderIndex: 0 }).returning();
    await db.insert(routines).values({ name: "Archived Day", orderIndex: 1, archivedAt: new Date() });
    await db.insert(mesocycles).values({
      routineId: active!.id,
      totalWeeks: 4,
      currentWeek: 2,
      weekPercents: JSON.stringify([80, 85, 90, 60]),
    });

    const res = await app.inject({ method: "GET", url: "/api/routines" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: active!.id, name: "Push Day" });
    expect(body[0].mesocycle).toMatchObject({ routineId: active!.id, totalWeeks: 4, currentWeek: 2, weekPercents: [80, 85, 90, 60] });
  });

  it("reports mesocycle null for a routine with no active cycle", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    await db.insert(routines).values({ name: "No Cycle", orderIndex: 0 });

    const res = await app.inject({ method: "GET", url: "/api/routines" });

    expect(res.json()[0].mesocycle).toBeNull();
  });
});

describe("POST /api/routines", () => {
  it("creates a routine with its exercise list", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const exercise = await insertTestExercise(db, { slug: "bench-press" });

    const res = await app.inject({
      method: "POST",
      url: "/api/routines",
      payload: {
        name: "Push Day",
        orderIndex: 0,
        exercises: [{ exerciseId: exercise.id, orderIndex: 0, targetSets: [{ reps: 5, weightKg: 100 }] }],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ name: "Push Day", orderIndex: 0 });
    expect(body.id).toEqual(expect.any(String));

    const listRes = await app.inject({ method: "GET", url: "/api/routines" });
    const listed = listRes.json()[0];
    expect(listed.routineExercises).toHaveLength(1);
    expect(listed.routineExercises[0]).toMatchObject({ exerciseId: exercise.id, targetSets: [{ reps: 5, weightKg: 100 }] });
  });

  it("defaults exercises to an empty list when omitted", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines", payload: { name: "Empty Routine" } });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: "Empty Routine", orderIndex: 0 });
  });

  it("rejects a missing name with the real 400 invalid_request shape", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines", payload: { orderIndex: 0 } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an empty name", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines", payload: { name: "" } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a routine exercise with zero target sets", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const exercise = await insertTestExercise(db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines",
      payload: { name: "Bad Routine", exercises: [{ exerciseId: exercise.id, orderIndex: 0, targetSets: [] }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a negative restBetweenSetsSeconds (0 is legitimate, negative is not)", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const exercise = await insertTestExercise(db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines",
      payload: {
        name: "Bad Rest",
        exercises: [{ exerciseId: exercise.id, orderIndex: 0, restBetweenSetsSeconds: -1 }],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("accepts a zero restBetweenSetsSeconds (BUG-02 regression)", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const exercise = await insertTestExercise(db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines",
      payload: {
        name: "No Rest",
        exercises: [{ exerciseId: exercise.id, orderIndex: 0, restBetweenSetsSeconds: 0 }],
      },
    });

    expect(res.statusCode).toBe(201);
  });
});

describe("PATCH /api/routines/:id", () => {
  it("updates name and orderIndex", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const [routine] = await db.insert(routines).values({ name: "Old Name", orderIndex: 0 }).returning();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/routines/${routine!.id}`,
      payload: { name: "New Name", orderIndex: 3 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const listRes = await app.inject({ method: "GET", url: "/api/routines" });
    expect(listRes.json()[0]).toMatchObject({ name: "New Name", orderIndex: 3 });
  });

  it("replaces the exercise list wholesale when exercises is provided", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const exerciseA = await insertTestExercise(db, { slug: "a" });
    const exerciseB = await insertTestExercise(db, { slug: "b" });
    const createRes = await app.inject({
      method: "POST",
      url: "/api/routines",
      payload: { name: "R", exercises: [{ exerciseId: exerciseA.id, orderIndex: 0 }] },
    });
    const routineId = createRes.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/routines/${routineId}`,
      payload: { exercises: [{ exerciseId: exerciseB.id, orderIndex: 0 }] },
    });

    expect(res.statusCode).toBe(200);
    const listRes = await app.inject({ method: "GET", url: "/api/routines" });
    const listed = listRes.json()[0];
    expect(listed.routineExercises).toHaveLength(1);
    expect(listed.routineExercises[0].exerciseId).toBe(exerciseB.id);
  });

  it("leaves the exercise list untouched when exercises is omitted", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const exercise = await insertTestExercise(db);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/routines",
      payload: { name: "R", exercises: [{ exerciseId: exercise.id, orderIndex: 0 }] },
    });
    const routineId = createRes.json().id;

    const res = await app.inject({ method: "PATCH", url: `/api/routines/${routineId}`, payload: { name: "Renamed" } });

    expect(res.statusCode).toBe(200);
    const listRes = await app.inject({ method: "GET", url: "/api/routines" });
    expect(listRes.json()[0].routineExercises).toHaveLength(1);
  });

  it("rejects a malformed body (wrong type for name)", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const [routine] = await db.insert(routines).values({ name: "R", orderIndex: 0 }).returning();

    const res = await app.inject({ method: "PATCH", url: `/api/routines/${routine!.id}`, payload: { name: 123 } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("404s for an id that doesn't exist, rather than silently reporting ok for zero affected rows", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);

    const res = await app.inject({ method: "PATCH", url: "/api/routines/does-not-exist", payload: { name: "New Name" } });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/routines/:id", () => {
  it("archives the routine so it drops out of the active list", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);
    const [routine] = await db.insert(routines).values({ name: "To Delete", orderIndex: 0 }).returning();

    const res = await app.inject({ method: "DELETE", url: `/api/routines/${routine!.id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const listRes = await app.inject({ method: "GET", url: "/api/routines" });
    expect(listRes.json()).toEqual([]);
  });

  it("404s for an id that doesn't exist", async () => {
    const { app, db } = createTestApp();
    registerRoutineRoutes(app, db);

    const res = await app.inject({ method: "DELETE", url: "/api/routines/does-not-exist" });

    expect(res.statusCode).toBe(404);
  });
});
