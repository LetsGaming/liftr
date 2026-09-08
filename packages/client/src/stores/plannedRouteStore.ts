import { defineStore } from "pinia";
import {
  createPlannedRoute,
  deletePlannedRoute,
  getPlannedRoutes,
  updatePlannedRoute,
  type PlannedRoute,
  type Waypoint,
} from "../services/plannedRouteService";

export const usePlannedRouteStore = defineStore("plannedRoute", {
  state: () => ({
    routes: [] as PlannedRoute[],
    loaded: false,
    error: false,
  }),
  getters: {
    byId: (state) => (id: string) => state.routes.find((r) => r.id === id),
  },
  actions: {
    async load() {
      try {
        this.routes = await getPlannedRoutes();
        this.loaded = true;
        this.error = false;
      } catch {
        this.error = true;
      }
    },
    async create(name: string, waypoints: Waypoint[]) {
      const route = await createPlannedRoute(name, waypoints);
      await this.load();
      return route;
    },
    async update(id: string, payload: { name?: string; waypoints?: Waypoint[] }) {
      await updatePlannedRoute(id, payload);
      await this.load();
    },
    async remove(id: string) {
      await deletePlannedRoute(id);
      this.routes = this.routes.filter((r) => r.id !== id);
    },
  },
});
