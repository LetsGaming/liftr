import { describe, expect, it } from "vitest";
import { plannedRoutes } from "@liftr/db";
import { registerPlannedRouteRoutes } from "~server/routes/plannedRoutes.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestUser } from "../helpers/testDb.js";

function waypoints() {
  return [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }];
}

describe("GET /api/planned-routes", () => {
  it("returns an empty array when there are no routes", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/planned-routes" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("excludes a soft-archived route", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    await db.insert(plannedRoutes).values({
      name: "Archived",
      waypoints: JSON.stringify(waypoints()),
      distanceM: 100,
      geometrySource: "straight",
      computedAt: new Date(),
      archivedAt: new Date(),
    });

    const res = await app.inject({ method: "GET", url: "/api/planned-routes" });

    expect(res.json()).toEqual([]);
  });
});

describe("POST /api/planned-routes", () => {
  it("creates a route with straight-line geometry when ORS is unconfigured", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/planned-routes",
      payload: { name: "Tempelhof-Runde", waypoints: waypoints() },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ name: "Tempelhof-Runde", geometrySource: "straight" });
    expect(body.points.length).toBe(2);
  });

  it("rejects fewer than 2 waypoints with a 400, never persisting a row", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/planned-routes",
      payload: { name: "Too short", waypoints: [{ lat: 0, lon: 0 }] },
    });

    expect(res.statusCode).toBe(400);
    const list = await app.inject({ method: "GET", url: "/api/planned-routes" });
    expect(list.json()).toEqual([]);
  });

  it("rejects more than 50 waypoints with a 400", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ lat: 52 + i * 0.001, lon: 13 }));

    const res = await app.inject({ method: "POST", url: "/api/planned-routes", payload: { name: "x", waypoints: tooMany } });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/planned-routes/:id", () => {
  it("returns 404 for a route belonging to another user", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const otherUser = await insertTestUser(db);
    const [row] = await db
      .insert(plannedRoutes)
      .values({
        userId: otherUser.id,
        name: "Not mine",
        waypoints: JSON.stringify(waypoints()),
        distanceM: 100,
        geometrySource: "straight",
        computedAt: new Date(),
      })
      .returning();

    const res = await app.inject({ method: "GET", url: `/api/planned-routes/${row!.id}` });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/planned-routes/:id", () => {
  it("renames without recomputing geometry", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const created = await app.inject({ method: "POST", url: "/api/planned-routes", payload: { name: "Original", waypoints: waypoints() } });
    const id = created.json().id;

    const res = await app.inject({ method: "PATCH", url: `/api/planned-routes/${id}`, payload: { name: "Renamed" } });

    expect(res.statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/api/planned-routes/${id}` });
    expect(detail.json().name).toBe("Renamed");
  });

  it("returns 404 when patching a nonexistent id", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({ method: "PATCH", url: "/api/planned-routes/nonexistent", payload: { name: "x" } });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/planned-routes/:id", () => {
  it("soft-archives — the route disappears from the list", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const created = await app.inject({ method: "POST", url: "/api/planned-routes", payload: { name: "Original", waypoints: waypoints() } });
    const id = created.json().id;

    const res = await app.inject({ method: "DELETE", url: `/api/planned-routes/${id}` });

    expect(res.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/api/planned-routes" });
    expect(list.json()).toEqual([]);
  });
});

describe("POST /api/planned-routes/preview", () => {
  it("returns computed stats without persisting anything", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/planned-routes/preview", payload: { waypoints: waypoints() } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ geometrySource: "straight" });
    const list = await app.inject({ method: "GET", url: "/api/planned-routes" });
    expect(list.json()).toEqual([]);
  });
});
