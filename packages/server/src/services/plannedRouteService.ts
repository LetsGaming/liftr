import { buildAvoidCorridor, haversineM, pathDistanceM } from "@liftr/shared";
import { plannedRoutePoints, type LiftrDb } from "@liftr/db";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../env.js";
import { fetchOrsRoute, OrsUnavailableError, type OrsRouteResult } from "../lib/openRouteService.js";
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

/** A route that ends within this of where it started is a loop by any reading — the wizard sends
 *  an exact duplicate of waypoints[0], but a hand-edited route or a marker dragged back onto the
 *  start needn't be pixel-exact. Metres, not coordinate equality, so the threshold means the same
 *  thing at every latitude. */
const LOOP_CLOSE_EPS_M = 25;

/** A 4xx while an avoidance corridor was applied means ORS understood the request and couldn't
 *  satisfy it — a dead-end street, the one bridge out of the valley. That's worth one retry
 *  without the corridor. A network error, timeout, 5xx, or parse failure says nothing about the
 *  corridor, and retrying would just double a real outage. */
function isAvoidanceRejection(err: OrsUnavailableError): boolean {
  return typeof err.status === "number" && err.status >= 400 && err.status < 500;
}

/** Returns the outbound leg of a closed loop (the duplicate closing point dropped, generated arc
 *  points filtered out — see the module doc on `fetchLoopRoute` for why), or `null` when
 *  `waypoints` isn't a loop at all. `gen` points are the wizard's blind geometric guess at a
 *  return leg (loop.ts) — with a real avoidance corridor the router picks the return streets
 *  itself, so they're dropped from what gets routed. They stay in the saved `waypoints` column
 *  untouched, so the wizard's own editable markers and offline line are unaffected. */
function closedLoopOutbound(waypoints: Waypoint[]): Waypoint[] | null {
  if (waypoints.length < 3) return null;
  const first = waypoints[0]!;
  const last = waypoints[waypoints.length - 1]!;
  if (!(haversineM(first, last) <= LOOP_CLOSE_EPS_M)) return null; // inverted: a NaN distance fails, not passes
  const outbound = waypoints.slice(0, -1).filter((w) => !w.gen);
  return outbound.length >= 2 ? outbound : null;
}

/**
 * Routes a closed loop as two ORS calls: the outbound leg exactly as an ordinary route, then a
 * closing leg from its end back to its start that avoids a corridor buffered around the
 * *outbound leg's own snapped streets* — real roads, a better buffer target than the raw taps
 * that produced them. This is what makes the loop respect actual streets: the router, not blind
 * arc geometry, decides where the return leg goes, and it's explicitly told not to just walk back
 * the same way.
 *
 * A single-call version (avoid the corridor for the whole route in one request) doesn't work:
 * `avoid_polygons` deletes graph edges before snapping, so the outbound waypoints themselves would
 * sit on deleted edges and fail to route at all. Two calls, only for loops, only at save/preview
 * time (never per live edit — see RouteWizard.vue), is the shape that actually routes.
 */
async function fetchLoopRoute(outbound: Waypoint[], logger: FastifyBaseLogger): Promise<OrsRouteResult> {
  const out = await fetchOrsRoute(outbound);
  const corridor = buildAvoidCorridor(out.coordinates);
  const legEnds = [outbound[outbound.length - 1]!, outbound[0]!];

  let back: OrsRouteResult;
  try {
    back = await fetchOrsRoute(legEnds, { avoidPolygons: corridor });
  } catch (err) {
    if (!(err instanceof OrsUnavailableError) || corridor == null || !isAvoidanceRejection(err)) throw err;
    logger.warn({ status: err.status }, "loop avoidance corridor unroutable, retrying without it");
    back = await fetchOrsRoute(legEnds);
  }

  return {
    // Drop back's first coordinate — it's the same point as out's last, just snapped twice.
    coordinates: [...out.coordinates, ...back.coordinates.slice(1)],
    distanceM: out.distanceM + back.distanceM,
    elevationGainM:
      out.elevationGainM == null && back.elevationGainM == null
        ? null
        : (out.elevationGainM ?? 0) + (back.elevationGainM ?? 0),
  };
}

/** The one place every write path (create, update, preview) converges so ORS-vs-fallback can't
 *  drift between them — the line the preview endpoint shows is provably the line that gets saved. */
export async function computeGeometry(waypoints: Waypoint[], logger: FastifyBaseLogger): Promise<ComputedGeometry> {
  if (env.orsApiKey) {
    try {
      const outbound = closedLoopOutbound(waypoints);
      const result = outbound ? await fetchLoopRoute(outbound, logger) : await fetchOrsRoute(waypoints);
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
    // An all-undefined patch (e.g. `{}`) reaches here with nothing to set — Drizzle's
    // mapUpdateSet throws "No values to set" on an empty .set({}), so no-op rather than issue a
    // pointless update.
    if (patch.name === undefined && patch.orderIndex === undefined) return;
    await updatePlannedRouteMeta(db, userId, id, { name: patch.name, orderIndex: patch.orderIndex });
    return;
  }
  const geometry = await computeGeometry(patch.waypoints, logger);
  // better-sqlite3's db.transaction() runs its callback fully synchronously (the underlying
  // native binding commits as soon as the callback returns) — an async callback returns a
  // pending Promise immediately, on the first `await`, so the driver considers the transaction
  // finished before the awaited statements actually execute, and every statement after the
  // first `await` silently runs on an already-closed transaction. So this callback stays
  // synchronous and drives each statement to completion via .run() rather than await, same as
  // Drizzle's own better-sqlite3 transaction docs require.
  db.transaction((tx) => {
    updatePlannedRouteMeta(tx, userId, id, {
      name: patch.name,
      orderIndex: patch.orderIndex,
      waypoints: patch.waypoints,
      distanceM: geometry.distanceM,
      elevationGainM: geometry.elevationGainM,
      geometrySource: geometry.geometrySource,
      computedAt: new Date(),
    }).run();
    deletePlannedRoutePoints(tx, id).run();
    // Inlined rather than routed through insertPlannedRoutePoints: that helper's no-op-on-empty
    // guard returns a plain Promise for the empty case (fine for its other, non-transactional
    // callers), which isn't a runnable query builder — this guard is equivalent, just expressed
    // so every branch here stays a synchronous .run() call.
    if (geometry.points.length > 0) {
      tx.insert(plannedRoutePoints)
        .values(geometry.points.map((p) => ({ ...p, routeId: id })))
        .run();
    }
  });
}
