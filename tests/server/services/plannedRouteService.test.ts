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

function orsBody(coords: [number, number, number?][], distance: number, ascent?: number) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        features: [
          {
            geometry: { coordinates: coords },
            properties: { summary: { distance }, ...(ascent !== undefined ? { ascent } : {}) },
          },
        ],
      }),
  } as Response;
}

function requestBody(callIndex: number) {
  const call = vi.mocked(fetch).mock.calls[callIndex]!;
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("computeGeometry loop closure", () => {
  const A: [number, number] = [13.4, 52.5]; // [lon, lat]
  const B: [number, number] = [13.41, 52.505];
  const C: [number, number] = [13.42, 52.51];
  const aWp = { lat: 52.5, lon: 13.4 };
  const bWp = { lat: 52.505, lon: 13.41 };
  const cWp = { lat: 52.51, lon: 13.42 };

  beforeEach(() => {
    env.orsApiKey = "test-key";
  });

  it("routes a non-loop waypoint list with exactly one un-avoided call", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(orsBody([A, B, C], 500));

    const geometry = await computeGeometry([aWp, bWp, cWp], noopLogger);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody(0).options).toBeUndefined();
    expect(geometry.geometrySource).toBe("ors");
  });

  it("routes a closed loop as an outbound call plus an avoided closing leg", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(orsBody([A, B, C], 500)).mockResolvedValueOnce(orsBody([C, A], 400));

    await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(0).coordinates).toEqual([A, B, C]);
    expect(requestBody(0).options).toBeUndefined();
    expect(requestBody(1).coordinates).toEqual([C, A]);
    expect(requestBody(1).options.avoid_polygons).toBeDefined();
  });

  it("treats a near-duplicate closing point as a loop, but not a clearly-different one", async () => {
    vi.mocked(fetch).mockResolvedValue(orsBody([A, B, C], 500));

    // ~10m north of A — well inside the 25m loop-closure threshold.
    await computeGeometry([aWp, bWp, cWp, { lat: 52.5001, lon: 13.4 }], noopLogger);
    expect(fetch).toHaveBeenCalledTimes(2); // loop: outbound + closing leg

    vi.mocked(fetch).mockClear();
    // ~200m north of A — clearly not a loop closure.
    await computeGeometry([aWp, bWp, cWp, { lat: 52.502, lon: 13.4 }], noopLogger);
    expect(fetch).toHaveBeenCalledTimes(1); // not a loop: one plain call
  });

  it("excludes generated arc points from the routed coordinates but not from loop detection", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(orsBody([A, B], 300)).mockResolvedValueOnce(orsBody([B, A], 300));

    const genPoint1 = { lat: 52.508, lon: 13.415, gen: true };
    const genPoint2 = { lat: 52.503, lon: 13.405, gen: true };
    await computeGeometry([aWp, bWp, genPoint1, genPoint2, { ...aWp }], noopLogger);

    expect(fetch).toHaveBeenCalledTimes(2); // still detected as a loop
    expect(requestBody(0).coordinates).toEqual([A, B]); // gen points excluded from the routed call
  });

  it("builds the corridor from the snapped geometry, not the raw waypoints", async () => {
    // Outbound call returns geometry well off the raw A/B/C taps — the corridor must buffer this
    // returned shape, not the input.
    const snapped: [number, number][] = [[13.4, 52.5], [13.405, 52.5005], [13.41, 52.501]];
    vi.mocked(fetch).mockResolvedValueOnce(orsBody(snapped, 500)).mockResolvedValueOnce(orsBody([C, A], 400));

    await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    const avoidCoords = requestBody(1).options.avoid_polygons.coordinates as number[][][][];
    // Every avoid-polygon vertex should be close to the snapped geometry's longitude/latitude
    // range, not the raw waypoints' (which run further east/north to C at 13.42/52.51).
    const allLons = avoidCoords.flatMap((poly) => poly[0]!.map((pt) => pt[0]!));
    expect(Math.max(...allLons)).toBeLessThan(13.42);
  });

  it("concatenates both legs into one geometry without duplicating the junction point", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(orsBody([[13.4, 52.5, 10], [13.41, 52.505, 12], [13.42, 52.51, 14]], 200, 4))
      .mockResolvedValueOnce(orsBody([[13.42, 52.51, 14], [13.41, 52.505, 13], [13.4, 52.5, 10]], 210, 3));

    const geometry = await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    expect(geometry.points).toHaveLength(5); // 3 + 3, junction not duplicated
    expect(geometry.points.map((p) => p.idx)).toEqual([0, 1, 2, 3, 4]);
    expect(geometry.distanceM).toBe(410);
    expect(geometry.elevationGainM).toBe(7);
  });

  it("reports elevationGainM null only when neither leg has one", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(orsBody([A, B], 300)) // no ascent
      .mockResolvedValueOnce(orsBody([B, A], 300)); // no ascent
    const both = await computeGeometry([aWp, bWp, { ...aWp }], noopLogger);
    expect(both.elevationGainM).toBeNull();

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch)
      .mockResolvedValueOnce(orsBody([A, B], 300, 5))
      .mockResolvedValueOnce(orsBody([B, A], 300)); // no ascent
    const one = await computeGeometry([aWp, bWp, { ...aWp }], noopLogger);
    expect(one.elevationGainM).toBe(5);
  });

  it("retries the closing leg without the corridor when ORS rejects it with a 4xx", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(orsBody([A, B, C], 500))
      .mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response)
      .mockResolvedValueOnce(orsBody([C, A], 400));

    const geometry = await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(requestBody(2).options).toBeUndefined(); // retry without avoidance
    expect(geometry.geometrySource).toBe("ors");
    expect(noopLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
      expect.stringContaining("avoidance"),
    );
  });

  it("does not retry a 5xx or network failure on the closing leg", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(orsBody([A, B, C], 500))
      .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) } as Response);

    const geometry = await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    expect(fetch).toHaveBeenCalledTimes(2); // no retry attempt
    expect(geometry.geometrySource).toBe("straight");
    expect(noopLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), expect.any(String));
  });

  it("falls back to straight-line when the outbound call itself fails, without attempting a closing leg", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response);

    const geometry = await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(geometry.geometrySource).toBe("straight");
  });

  it("never calls fetch for a loop when the key is unset", async () => {
    env.orsApiKey = undefined;

    const geometry = await computeGeometry([aWp, bWp, cWp, { ...aWp }], noopLogger);

    expect(fetch).not.toHaveBeenCalled();
    expect(geometry.geometrySource).toBe("straight");
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
