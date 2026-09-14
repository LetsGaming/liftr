import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, plannedRoutes, type LiftrDb } from "@liftr/db";
import { eq } from "drizzle-orm";
import { createTestDb, insertTestUser } from "../helpers/testDb.js";
import {
  archivePlannedRoute,
  findActivePlannedRoutes,
  findPlannedRouteById,
  findPlannedRoutePoints,
  insertPlannedRoute,
  insertPlannedRoutePoints,
  deletePlannedRoutePoints,
  updatePlannedRouteMeta,
} from "~server/repositories/plannedRouteRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function newRoute(overrides: Partial<Parameters<typeof insertPlannedRoute>[2]> = {}) {
  return insertPlannedRoute(db, OWNER_USER_ID, {
    name: "Tempelhof-Runde",
    orderIndex: 0,
    waypoints: [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }],
    distanceM: 500,
    elevationGainM: 10,
    geometrySource: "ors",
    computedAt: new Date(),
    ...overrides,
  });
}

describe("insertPlannedRoute / findPlannedRouteById", () => {
  it("round-trips waypoints through the JSON column", async () => {
    const route = await newRoute();

    const found = await findPlannedRouteById(db, OWNER_USER_ID, route.id);

    expect(found?.waypoints).toEqual([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }]);
  });

  it("returns undefined for another user's route", async () => {
    const route = await newRoute();
    const otherUser = await insertTestUser(db);
    await db.insert(plannedRoutes).values({ userId: otherUser.id, name: "Other", waypoints: "[]", distanceM: 0, geometrySource: "straight", computedAt: new Date() });

    const found = await findPlannedRouteById(db, otherUser.id, route.id);

    expect(found).toBeUndefined();
  });
});

describe("findActivePlannedRoutes", () => {
  it("excludes archived routes and orders by orderIndex", async () => {
    const b = await newRoute({ name: "B", orderIndex: 1 });
    const a = await newRoute({ name: "A", orderIndex: 0 });
    const archived = await newRoute({ name: "Archived", orderIndex: 2 });
    await archivePlannedRoute(db, OWNER_USER_ID, archived.id);

    const result = await findActivePlannedRoutes(db, OWNER_USER_ID);

    expect(result.map((r) => r.id)).toEqual([a.id, b.id]);
  });
});

describe("insertPlannedRoutePoints / findPlannedRoutePoints / deletePlannedRoutePoints", () => {
  it("no-ops on an empty array", async () => {
    const route = await newRoute();
    await expect(insertPlannedRoutePoints(db, route.id, [])).resolves.not.toThrow();
    expect(await findPlannedRoutePoints(db, route.id)).toEqual([]);
  });

  it("stores and orders points by idx, and cascades on route deletion", async () => {
    const route = await newRoute();
    await insertPlannedRoutePoints(db, route.id, [
      { idx: 1, lat: 52.474, lon: 13.403, ele: 41 },
      { idx: 0, lat: 52.4732, lon: 13.4021, ele: 40 },
    ]);

    const points = await findPlannedRoutePoints(db, route.id);
    expect(points.map((p) => p.idx)).toEqual([0, 1]);

    await deletePlannedRoutePoints(db, route.id);
    expect(await findPlannedRoutePoints(db, route.id)).toEqual([]);
  });

  it("cascades on the DB's own onDelete when the parent route row is deleted directly", async () => {
    const route = await newRoute();
    await insertPlannedRoutePoints(db, route.id, [{ idx: 0, lat: 1, lon: 1, ele: null }]);

    await db.delete(plannedRoutes).where(eq(plannedRoutes.id, route.id));

    expect(await findPlannedRoutePoints(db, route.id)).toEqual([]);
  });
});

describe("updatePlannedRouteMeta", () => {
  it("updates only the provided fields, re-serializing waypoints when present", async () => {
    const route = await newRoute();

    await updatePlannedRouteMeta(db, OWNER_USER_ID, route.id, { name: "Renamed" });
    let found = await findPlannedRouteById(db, OWNER_USER_ID, route.id);
    expect(found?.name).toBe("Renamed");
    expect(found?.waypoints).toEqual(route.waypoints); // untouched

    await updatePlannedRouteMeta(db, OWNER_USER_ID, route.id, { waypoints: [{ lat: 1, lon: 2 }] });
    found = await findPlannedRouteById(db, OWNER_USER_ID, route.id);
    expect(found?.waypoints).toEqual([{ lat: 1, lon: 2 }]);
  });
});

describe("archivePlannedRoute", () => {
  it("soft-deletes — the row survives with archivedAt set", async () => {
    const route = await newRoute();

    await archivePlannedRoute(db, OWNER_USER_ID, route.id);

    const row = await db.query.plannedRoutes.findFirst({ where: eq(plannedRoutes.id, route.id) });
    expect(row?.archivedAt).not.toBeNull();
  });
});
