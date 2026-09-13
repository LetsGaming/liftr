import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
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
      // `loaded` means "attempted", not "succeeded" — `error` already carries the
      // success/failure distinction for anything that cares. Every call site guards a refetch
      // on `if (!loaded) load()`, so leaving `loaded` false forever on a failed attempt would
      // refire the request on every subsequent visit instead of just once — hence
      // `loadedOnError` below.
      await withLoadState(getPlannedRoutes, {
        apply: (routes) => (this.routes = routes),
        setLoaded: (v) => (this.loaded = v),
        setError: (v) => (this.error = v),
        loadedOnError: true,
      });
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
