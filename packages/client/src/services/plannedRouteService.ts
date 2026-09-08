import { api } from "../lib/api";

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

export type GeometrySource = "ors" | "straight";

export interface PlannedRoute {
  id: string;
  name: string;
  orderIndex: number;
  waypoints: Waypoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: GeometrySource;
  computedAt: string;
  createdAt: string;
}

export interface PlannedRouteDetail extends PlannedRoute {
  points: RoutePoint[];
}

export interface RoutePreview {
  points: RoutePoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: GeometrySource;
}

export function getPlannedRoutes(): Promise<PlannedRoute[]> {
  return api.get<PlannedRoute[]>("/api/planned-routes");
}

export function getPlannedRouteDetail(id: string): Promise<PlannedRouteDetail> {
  return api.get<PlannedRouteDetail>(`/api/planned-routes/${id}`);
}

export function previewPlannedRoute(waypoints: Waypoint[], signal?: AbortSignal): Promise<RoutePreview> {
  return api.post<RoutePreview>("/api/planned-routes/preview", { waypoints }, signal ? { signal } : undefined);
}

export function createPlannedRoute(name: string, waypoints: Waypoint[]): Promise<PlannedRouteDetail> {
  return api.post<PlannedRouteDetail>("/api/planned-routes", { name, waypoints });
}

export function updatePlannedRoute(
  id: string,
  payload: { name?: string; waypoints?: Waypoint[]; orderIndex?: number },
): Promise<void> {
  return api.patch(`/api/planned-routes/${id}`, payload);
}

export function deletePlannedRoute(id: string): Promise<void> {
  return api.del(`/api/planned-routes/${id}`);
}
