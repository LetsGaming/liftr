import { plannedRoutePoints, plannedRoutes, type LiftrDb } from "@liftr/db";
import { and, eq, inArray } from "drizzle-orm";

/** Accepts either the top-level `LiftrDb` or a `db.transaction((tx) => ...)` callback's `tx` —
 *  both expose the same query-builder methods these write helpers use, but `tx`'s concrete type
 *  (`SQLiteTransaction<...>`) isn't structurally assignable to `LiftrDb` itself (it's missing
 *  `$client`), so writers that need to run inside a transaction (see
 *  services/plannedRouteService.ts's updatePlannedRoute) take this narrower, transaction-
 *  compatible type instead. */
export type PlannedRouteDbClient = Pick<LiftrDb, "update" | "delete" | "insert" | "query">;

export interface Waypoint {
  lat: number;
  lon: number;
}

export interface RoutePoint {
  idx: number;
  lat: number;
  lon: number;
  ele: number | null;
}

export interface NewPlannedRoute {
  name: string;
  orderIndex: number;
  waypoints: Waypoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: "ors" | "straight";
  computedAt: Date;
}

/** `waypoints` is stored as JSON text — parsed here, at the repository edge, same convention as
 *  routineRepository.ts's targetSets. */
export async function findActivePlannedRoutes(db: LiftrDb, userId: string) {
  const rows = await db.query.plannedRoutes.findMany({
    where: (r, { isNull, and: andOp, eq: eqOp }) => andOp(eqOp(r.userId, userId), isNull(r.archivedAt)),
    // orderIndex alone is effectively undefined ordering — nothing client-side ever sets a
    // non-zero orderIndex, so every row ties at 0 and falls back to SQLite rowid order in
    // practice. createdAt as a secondary key gives a stable, meaningful tiebreak.
    orderBy: (r, { asc }) => [asc(r.orderIndex), asc(r.createdAt)],
  });
  return rows.map((r) => ({ ...r, waypoints: JSON.parse(r.waypoints) as Waypoint[] }));
}

export async function findPlannedRouteById(db: LiftrDb, userId: string, id: string) {
  const row = await db.query.plannedRoutes.findFirst({
    where: and(eq(plannedRoutes.userId, userId), eq(plannedRoutes.id, id)),
  });
  if (!row) return undefined;
  return { ...row, waypoints: JSON.parse(row.waypoints) as Waypoint[] };
}

/** `planned_route_points` has no `user_id` of its own (child-via-parent, like `run_points`) —
 *  callers must already have resolved/authorized `routeId` via `findPlannedRouteById` first. */
export function findPlannedRoutePoints(db: LiftrDb, routeId: string) {
  return db.query.plannedRoutePoints.findMany({
    where: eq(plannedRoutePoints.routeId, routeId),
    orderBy: plannedRoutePoints.idx,
  });
}

/** Same child-via-parent authorization rule as findPlannedRoutePoints — callers must already
 *  have resolved/authorized every id in `routeIds` (e.g. via findActivePlannedRoutes) before
 *  calling this. Batches the points fetch for a whole route list into one query instead of one
 *  round-trip per route, grouped back into a per-route map ordered by idx within each group. */
export async function findPlannedRoutePointsForRoutes(
  db: LiftrDb,
  routeIds: string[],
): Promise<Map<string, RoutePoint[]>> {
  const byRoute = new Map<string, RoutePoint[]>();
  if (routeIds.length === 0) return byRoute;
  const rows = await db.query.plannedRoutePoints.findMany({
    where: inArray(plannedRoutePoints.routeId, routeIds),
    orderBy: [plannedRoutePoints.routeId, plannedRoutePoints.idx],
  });
  for (const row of rows) {
    const list = byRoute.get(row.routeId);
    if (list) list.push(row);
    else byRoute.set(row.routeId, [row]);
  }
  return byRoute;
}

export async function insertPlannedRoute(db: LiftrDb, userId: string, values: NewPlannedRoute) {
  const [route] = await db
    .insert(plannedRoutes)
    .values({ ...values, userId, waypoints: JSON.stringify(values.waypoints) })
    .returning();
  if (!route) throw new Error("planned route insert failed");
  return { ...route, waypoints: values.waypoints };
}

/** No-op on an empty array, mirrors insertRunPoints. */
export function insertPlannedRoutePoints(db: PlannedRouteDbClient, routeId: string, points: RoutePoint[]) {
  if (points.length === 0) return Promise.resolve();
  return db.insert(plannedRoutePoints).values(points.map((p) => ({ ...p, routeId })));
}

export function deletePlannedRoutePoints(db: PlannedRouteDbClient, routeId: string) {
  return db.delete(plannedRoutePoints).where(eq(plannedRoutePoints.routeId, routeId));
}

export function updatePlannedRouteMeta(
  db: PlannedRouteDbClient,
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    orderIndex: number;
    waypoints: Waypoint[];
    distanceM: number;
    elevationGainM: number | null;
    geometrySource: "ors" | "straight";
    computedAt: Date;
  }>,
) {
  const { waypoints, ...rest } = patch;
  return db
    .update(plannedRoutes)
    .set({ ...rest, ...(waypoints ? { waypoints: JSON.stringify(waypoints) } : {}) })
    .where(and(eq(plannedRoutes.userId, userId), eq(plannedRoutes.id, id)));
}

export function archivePlannedRoute(db: LiftrDb, userId: string, id: string) {
  return db
    .update(plannedRoutes)
    .set({ archivedAt: new Date() })
    .where(and(eq(plannedRoutes.userId, userId), eq(plannedRoutes.id, id)));
}
