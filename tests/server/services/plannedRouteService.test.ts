import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { findPlannedRoutePoints } from "~server/repositories/plannedRouteRepository.js";

vi.mock("~server/env.js", () => ({
  env: { orsApiKey: undefined as string | undefined, orsBaseUrl: "https://ors.test", orsProfile: "foot-walking" },
}));

import { env } from "~server/env.js";
import { computeGeometry, createPlannedRoute, updatePlannedRoute } from "~server/services/plannedRouteService.js";

const noopLogger = { warn: vi.fn() } as unknown as FastifyBaseLogger;
const waypoints = [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }];

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
  vi.stubGlobal("fetch", vi.fn());
  env.orsApiKey = undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computeGeometry", () => {
  it("skips fetch entirely and falls back to straight-line when the key is unset", async () => {
    const geometry = await computeGeometry(waypoints, noopLogger);

    expect(fetch).not.toHaveBeenCalled();
    expect(geometry.geometrySource).toBe("straight");
    expect(geometry.elevationGainM).toBeNull();
    expect(geometry.distanceM).toBeGreaterThan(0);
    expect(geometry.points).toEqual([
      { idx: 0, lat: 52.4732, lon: 13.4021, ele: null },
      { idx: 1, lat: 52.475, lon: 13.405, ele: null },
    ]);
  });

  it("uses ORS's result when the key is set and the call succeeds", async () => {
    env.orsApiKey = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [[13.4021, 52.4732, 40], [13.405, 52.475, 45]] },
              properties: { summary: { distance: 6400 }, ascent: 5 },
            },
          ],
        }),
    } as Response);

    const geometry = await computeGeometry(waypoints, noopLogger);

    expect(geometry.geometrySource).toBe("ors");
    expect(geometry.distanceM).toBe(6400);
    expect(geometry.elevationGainM).toBe(5);
    expect(geometry.points).toHaveLength(2);
  });

  it("falls back to straight-line and logs a warning when ORS responds with a non-2xx status", async () => {
    env.orsApiKey = "test-key";
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response);

    const geometry = await computeGeometry(waypoints, noopLogger);

    expect(geometry.geometrySource).toBe("straight");
    expect(noopLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }), expect.any(String));
  });
});

describe("createPlannedRoute", () => {
  it("persists the computed geometry's points alongside the route", async () => {
    const route = await createPlannedRoute(db, OWNER_USER_ID, { name: "Test", orderIndex: 0, waypoints }, noopLogger);

    expect(route.geometrySource).toBe("straight");
    const points = await findPlannedRoutePoints(db, route.id);
    expect(points).toHaveLength(2);
  });
});

describe("updatePlannedRoute", () => {
  it("does not call fetch on a rename-only patch (no waypoints in the patch)", async () => {
    const route = await createPlannedRoute(db, OWNER_USER_ID, { name: "Original", orderIndex: 0, waypoints }, noopLogger);
    vi.mocked(fetch).mockClear();
    env.orsApiKey = "test-key";

    await updatePlannedRoute(db, OWNER_USER_ID, route.id, { name: "Renamed" }, noopLogger);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("recomputes geometry and replaces points when waypoints change", async () => {
    const route = await createPlannedRoute(db, OWNER_USER_ID, { name: "Original", orderIndex: 0, waypoints }, noopLogger);
    const newWaypoints = [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.48, lon: 13.41 }, { lat: 52.49, lon: 13.42 }];

    await updatePlannedRoute(db, OWNER_USER_ID, route.id, { waypoints: newWaypoints }, noopLogger);

    const points = await findPlannedRoutePoints(db, route.id);
    expect(points).toHaveLength(3);
  });
});
