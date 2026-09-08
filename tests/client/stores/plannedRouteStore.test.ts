import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/plannedRouteService", () => ({
  getPlannedRoutes: vi.fn(),
  createPlannedRoute: vi.fn(),
  updatePlannedRoute: vi.fn(),
  deletePlannedRoute: vi.fn(),
}));

import { createPlannedRoute, deletePlannedRoute, getPlannedRoutes } from "~client/services/plannedRouteService";
import { usePlannedRouteStore } from "~client/stores/plannedRouteStore";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("usePlannedRouteStore", () => {
  it("load() populates routes and flips loaded on success", async () => {
    vi.mocked(getPlannedRoutes).mockResolvedValue([{ id: "r1" } as never]);
    const store = usePlannedRouteStore();

    await store.load();

    expect(store.routes).toEqual([{ id: "r1" }]);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() sets error on failure without throwing", async () => {
    vi.mocked(getPlannedRoutes).mockRejectedValue(new Error("network"));
    const store = usePlannedRouteStore();

    await store.load();

    expect(store.error).toBe(true);
  });

  it("create() reloads the list after creating", async () => {
    vi.mocked(createPlannedRoute).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getPlannedRoutes).mockResolvedValue([{ id: "r1" } as never]);
    const store = usePlannedRouteStore();

    await store.create("Test", [{ lat: 1, lon: 2 }]);

    expect(getPlannedRoutes).toHaveBeenCalled();
    expect(store.routes).toEqual([{ id: "r1" }]);
  });

  it("remove() splices locally without a reload", async () => {
    const store = usePlannedRouteStore();
    store.routes = [{ id: "r1" } as never, { id: "r2" } as never];
    vi.mocked(deletePlannedRoute).mockResolvedValue(undefined);

    await store.remove("r1");

    expect(store.routes).toEqual([{ id: "r2" }]);
    expect(getPlannedRoutes).not.toHaveBeenCalled();
  });

  it("byId finds a loaded route by id", async () => {
    const store = usePlannedRouteStore();
    store.routes = [{ id: "r1", name: "Test" } as never];

    expect(store.byId("r1")).toEqual({ id: "r1", name: "Test" });
    expect(store.byId("missing")).toBeUndefined();
  });
});
