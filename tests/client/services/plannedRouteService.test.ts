import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import { api } from "~client/lib/api";
import { createPlannedRoute, deletePlannedRoute, getPlannedRoutes, previewPlannedRoute, updatePlannedRoute } from "~client/services/plannedRouteService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockPatch = vi.mocked(api.patch);
const mockDel = vi.mocked(api.del);

beforeEach(() => vi.clearAllMocks());

describe("getPlannedRoutes", () => {
  it("GETs the list endpoint", async () => {
    mockGet.mockResolvedValue([]);
    await getPlannedRoutes();
    expect(mockGet).toHaveBeenCalledWith("/api/planned-routes");
  });
});

describe("previewPlannedRoute", () => {
  it("passes an AbortSignal through to api.post when given one", async () => {
    mockPost.mockResolvedValue({ points: [], distanceM: 0, elevationGainM: null, geometrySource: "straight" });
    const controller = new AbortController();

    await previewPlannedRoute([{ lat: 1, lon: 2 }], controller.signal);

    expect(mockPost).toHaveBeenCalledWith("/api/planned-routes/preview", { waypoints: [{ lat: 1, lon: 2 }] }, { signal: controller.signal });
  });

  it("omits the init argument when no signal is given", async () => {
    mockPost.mockResolvedValue({ points: [], distanceM: 0, elevationGainM: null, geometrySource: "straight" });

    await previewPlannedRoute([{ lat: 1, lon: 2 }]);

    expect(mockPost).toHaveBeenCalledWith("/api/planned-routes/preview", { waypoints: [{ lat: 1, lon: 2 }] }, undefined);
  });
});

describe("createPlannedRoute / updatePlannedRoute / deletePlannedRoute", () => {
  it("POSTs name + waypoints to create", async () => {
    mockPost.mockResolvedValue({ id: "r1" });
    await createPlannedRoute("Test", [{ lat: 1, lon: 2 }]);
    expect(mockPost).toHaveBeenCalledWith("/api/planned-routes", { name: "Test", waypoints: [{ lat: 1, lon: 2 }] });
  });

  it("PATCHes only the given fields", async () => {
    mockPatch.mockResolvedValue(undefined);
    await updatePlannedRoute("r1", { name: "Renamed" });
    expect(mockPatch).toHaveBeenCalledWith("/api/planned-routes/r1", { name: "Renamed" });
  });

  it("DELETEs by id", async () => {
    mockDel.mockResolvedValue(undefined);
    await deletePlannedRoute("r1");
    expect(mockDel).toHaveBeenCalledWith("/api/planned-routes/r1");
  });
});
