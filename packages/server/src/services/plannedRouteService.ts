import { pathDistanceM } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../env.js";
import { fetchOrsRoute, OrsUnavailableError } from "../lib/openRouteService.js";
import {
  insertPlannedRoute,
  insertPlannedRoutePoints,
  deletePlannedRoutePoints,
  updatePlannedRouteMeta,
  type RoutePoint,
  type Waypoint,
} from "../repositories/plannedRouteRepository.js";

export interface ComputedGeometry {
  points: RoutePoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: "ors" | "straight";
}

/** The one place every write path (create, update, preview) converges so ORS-vs-fallback can't
 *  drift between them — the line the preview endpoint shows is provably the line that gets saved. */
export async function computeGeometry(waypoints: Waypoint[], logger: FastifyBaseLogger): Promise<ComputedGeometry> {
  if (env.orsApiKey) {
    try {
      const result = await fetchOrsRoute(waypoints);
      return {
        points: result.coordinates.map((c, idx) => ({ idx, lat: c.lat, lon: c.lon, ele: c.ele ?? null })),
        distanceM: result.distanceM,
        elevationGainM: result.elevationGainM,
        geometrySource: "ors",
      };
    } catch (err) {
      if (!(err instanceof OrsUnavailableError)) throw err;
      logger.warn({ status: err.status }, "ORS unavailable, falling back to straight-line geometry");
    }
  }
  return {
    points: waypoints.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: null })),
    distanceM: pathDistanceM(waypoints),
    elevationGainM: null,
    geometrySource: "straight",
  };
}

export async function previewPlannedRoute(waypoints: Waypoint[], logger: FastifyBaseLogger) {
  return computeGeometry(waypoints, logger);
}

export async function createPlannedRoute(
  db: LiftrDb,
  userId: string,
  input: { name: string; orderIndex: number; waypoints: Waypoint[] },
  logger: FastifyBaseLogger,
) {
  const geometry = await computeGeometry(input.waypoints, logger);
  const route = await insertPlannedRoute(db, userId, {
    name: input.name,
    orderIndex: input.orderIndex,
    waypoints: input.waypoints,
    distanceM: geometry.distanceM,
    elevationGainM: geometry.elevationGainM,
    geometrySource: geometry.geometrySource,
    computedAt: new Date(),
  });
  await insertPlannedRoutePoints(db, route.id, geometry.points);
  return { ...route, points: geometry.points };
}

/** Recomputes geometry + replaces points only when `waypoints` is present in the patch — mirrors
 *  routine PATCH only touching exercises when `body.exercises` is present, so a rename-only patch
 *  never calls ORS. Assumes the caller (the route handler) has already confirmed the route exists
 *  and belongs to `userId` — this function does not re-check. */
export async function updatePlannedRoute(
  db: LiftrDb,
  userId: string,
  id: string,
  patch: { name?: string; orderIndex?: number; waypoints?: Waypoint[] },
  logger: FastifyBaseLogger,
) {
  if (!patch.waypoints) {
    await updatePlannedRouteMeta(db, userId, id, { name: patch.name, orderIndex: patch.orderIndex });
    return;
  }
  const geometry = await computeGeometry(patch.waypoints, logger);
  await updatePlannedRouteMeta(db, userId, id, {
    name: patch.name,
    orderIndex: patch.orderIndex,
    waypoints: patch.waypoints,
    distanceM: geometry.distanceM,
    elevationGainM: geometry.elevationGainM,
    geometrySource: geometry.geometrySource,
    computedAt: new Date(),
  });
  await deletePlannedRoutePoints(db, id);
  await insertPlannedRoutePoints(db, id, geometry.points);
}
