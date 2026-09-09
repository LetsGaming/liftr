import { z } from "zod";
import { downsamplePolyline } from "@liftr/shared";
import type { AppDb } from "../db.js";
import { NotFoundError } from "../lib/errors.js";
import {
  archivePlannedRoute,
  findActivePlannedRoutes,
  findPlannedRouteById,
  findPlannedRoutePoints,
  findPlannedRoutePointsForRoutes,
} from "../repositories/plannedRouteRepository.js";
import { createPlannedRoute, previewPlannedRoute, updatePlannedRoute } from "../services/plannedRouteService.js";
import type { ZodFastifyInstance } from "../types.js";

const waypointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const waypointsSchema = z.array(waypointSchema).min(2).max(50);

const createInput = z.object({ name: z.string().min(1), orderIndex: z.number().int().default(0), waypoints: waypointsSchema });
const updateInput = z.object({
  name: z.string().min(1).optional(),
  orderIndex: z.number().int().optional(),
  waypoints: waypointsSchema.optional(),
});
const previewInput = z.object({ waypoints: waypointsSchema });
const routeIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });

const routePointResponse = z.object({ idx: z.number(), lat: z.number(), lon: z.number(), ele: z.number().nullable() });

const plannedRouteResponse = z.object({
  id: z.string(),
  name: z.string(),
  orderIndex: z.number(),
  waypoints: z.array(waypointSchema),
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
  geometrySource: z.enum(["ors", "straight"]),
  computedAt: z.date(),
  createdAt: z.date(),
});

const previewResponse = z.object({
  points: z.array(routePointResponse),
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
  geometrySource: z.enum(["ors", "straight"]),
});

// List-only: adds a downsampled real polyline (the routed/road-snapped shape, not just the
// waypoint corners) so a route card can draw an honest map-preview thumbnail without an extra
// per-route detail fetch. Extends plannedRouteResponse rather than changing it, since that base
// schema is shared with the detail/create/update handlers below, which already return the full
// (non-downsampled) `points` array and have no use for this smaller field.
const plannedRouteListResponse = plannedRouteResponse.extend({
  polyline: z.array(waypointSchema),
});

export function registerPlannedRouteRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get(
    "/api/planned-routes",
    { schema: { response: { 200: z.array(plannedRouteListResponse) } } },
    async (req) => {
      const routes = await findActivePlannedRoutes(db, req.userId);
      const pointsByRoute = await findPlannedRoutePointsForRoutes(
        db,
        routes.map((r) => r.id),
      );
      return routes.map((route) => {
        const points = pointsByRoute.get(route.id);
        const source = points && points.length >= 2 ? points : route.waypoints;
        return { ...route, polyline: downsamplePolyline(source.map((p) => ({ lat: p.lat, lon: p.lon }))) };
      });
    },
  );

  app.get(
    "/api/planned-routes/:id",
    { schema: { params: routeIdParams, response: { 200: plannedRouteResponse.extend({ points: z.array(routePointResponse) }) } } },
    async (req) => {
      const route = await findPlannedRouteById(db, req.userId, req.params.id);
      if (!route) throw new NotFoundError();
      const points = await findPlannedRoutePoints(db, req.params.id);
      return { ...route, points };
    },
  );

  // Not persisted, no id — this is what makes the map show the real snapped line while editing,
  // via the exact same computeGeometry the create/update paths use, so it can't drift from them.
  app.post(
    "/api/planned-routes/preview",
    { schema: { body: previewInput, response: { 200: previewResponse } } },
    async (req) => {
      return previewPlannedRoute(req.body.waypoints, req.log);
    },
  );

  app.post(
    "/api/planned-routes",
    { schema: { body: createInput, response: { 201: plannedRouteResponse.extend({ points: z.array(routePointResponse) }) } } },
    async (req, reply) => {
      const route = await createPlannedRoute(db, req.userId, req.body, req.log);
      reply.code(201);
      return route;
    },
  );

  app.patch(
    "/api/planned-routes/:id",
    { schema: { params: routeIdParams, body: updateInput, response: { 200: okResponse } } },
    async (req) => {
      const existing = await findPlannedRouteById(db, req.userId, req.params.id);
      if (!existing) throw new NotFoundError();
      await updatePlannedRoute(db, req.userId, req.params.id, req.body, req.log);
      return { ok: true as const };
    },
  );

  app.delete(
    "/api/planned-routes/:id",
    { schema: { params: routeIdParams, response: { 200: okResponse } } },
    async (req) => {
      const existing = await findPlannedRouteById(db, req.userId, req.params.id);
      if (!existing) throw new NotFoundError();
      await archivePlannedRoute(db, req.userId, req.params.id);
      return { ok: true as const };
    },
  );
}
