import { beforeEach, describe, expect, it } from "vitest";
import { routines, type LiftrDb } from "@liftr/db";
import type { FastifyInstance } from "fastify";
import { registerMesocycleRoutes } from "~server/routes/mesocycles.js";
import { createTestApp } from "../helpers/testApp.js";

let app: FastifyInstance;
let db: LiftrDb;
let routineId: string;

beforeEach(async () => {
  ({ app, db } = createTestApp());
  registerMesocycleRoutes(app, db);
  const [routine] = await db.insert(routines).values({ name: "Test Routine" }).returning();
  routineId = routine!.id;
});

describe("POST /api/routines/:id/mesocycle", () => {
  it("attaches a cycle starting at week 1 with a generated week-percent curve", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/routines/${routineId}/mesocycle`,
      payload: { totalWeeks: 4 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ routineId, totalWeeks: 4, currentWeek: 1 });
    expect(body.weekPercents).toHaveLength(4);
  });

  it("replaces any existing cycle for the routine rather than creating a second one", async () => {
    await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle`, payload: { totalWeeks: 4 } });

    const res = await app.inject({
      method: "POST",
      url: `/api/routines/${routineId}/mesocycle`,
      payload: { totalWeeks: 6 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ totalWeeks: 6, currentWeek: 1 });
  });

  it("rejects a totalWeeks below the 1-week minimum with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/routines/${routineId}/mesocycle`,
      payload: { totalWeeks: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a totalWeeks above the 16-week maximum with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/routines/${routineId}/mesocycle`,
      payload: { totalWeeks: 17 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing totalWeeks with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/routines/${routineId}/mesocycle`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});

describe("DELETE /api/routines/:id/mesocycle", () => {
  it("detaches the cycle and returns ok:true", async () => {
    await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle`, payload: { totalWeeks: 4 } });

    const res = await app.inject({ method: "DELETE", url: `/api/routines/${routineId}/mesocycle` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const advanceRes = await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle/advance` });
    expect(advanceRes.statusCode).toBe(404);
  });

  it("returns ok:true even when the routine has no active mesocycle", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/routines/${routineId}/mesocycle` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/routines/:id/mesocycle/advance", () => {
  it("increments currentWeek by one", async () => {
    await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle`, payload: { totalWeeks: 4 } });

    const res = await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle/advance` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ currentWeek: 2 });
  });

  it("caps at totalWeeks instead of looping past a finished cycle", async () => {
    await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle`, payload: { totalWeeks: 2 } });
    await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle/advance` }); // week 2

    const res = await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle/advance` }); // would be week 3

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ currentWeek: 2 });
  });

  it("returns a 404 not_found when the routine has no active mesocycle", async () => {
    const res = await app.inject({ method: "POST", url: `/api/routines/${routineId}/mesocycle/advance` });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});
