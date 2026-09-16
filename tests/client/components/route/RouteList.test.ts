// RouteList.vue renders through the same CardGrid/ListCard base components as
// RoutineList.vue (components/ui/CardGrid.vue, components/ui/ListCard.vue) — this test focuses
// on RouteList's own wiring (menu open/edit/delete, start/create emits, empty state), not the
// shared card shape itself (covered by RoutineList.test.ts).
const { getPlannedRoutesMock, deletePlannedRouteMock } = vi.hoisted(() => ({
  getPlannedRoutesMock: vi.fn(),
  deletePlannedRouteMock: vi.fn(),
}));

vi.mock("~client/services/plannedRouteService", () => ({
  getPlannedRoutes: getPlannedRoutesMock,
  deletePlannedRoute: deletePlannedRouteMock,
  createPlannedRoute: vi.fn(),
  updatePlannedRoute: vi.fn(),
}));

import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteList from "~client/components/route/RouteList.vue";
import { usePlannedRouteStore } from "~client/stores/plannedRouteStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import type { PlannedRoute } from "~client/services/plannedRouteService";

function makeRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-1",
    name: "Tempelhof-Runde",
    orderIndex: 0,
    waypoints: [],
    distanceM: 6400,
    elevationGainM: 34,
    geometrySource: "ors",
    computedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    polyline: [],
    ...overrides,
  };
}

const STUBS = { RouteThumbnail: { template: "<div class='route-thumb-stub' />" } };

// Same stub as RoutineList.test.ts: RouteList.vue's drag-reorder gating reads
// window.matchMedia("(min-width: 900px)") on mount, which jsdom doesn't implement.
function stubMatchMedia(matchesDesktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  getPlannedRoutesMock.mockResolvedValue([]);
  deletePlannedRouteMock.mockResolvedValue(undefined);
  stubMatchMedia(false);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mountWithRoutes(routes: PlannedRoute[]) {
  getPlannedRoutesMock.mockResolvedValue(routes);
  const wrapper = mountWithProviders(RouteList, { global: { stubs: STUBS } });
  await usePlannedRouteStore().load();
  await flushPromises();
  return wrapper;
}

describe("RouteList", () => {
  it("shows the empty state and emits create when there are no routes", async () => {
    const wrapper = await mountWithRoutes([]);

    expect(wrapper.find(".card-grid").exists()).toBe(false);
    expect(wrapper.find(".empty-state-card").exists()).toBe(true);

    await wrapper.find(".empty-state-card button.btn-primary").trigger("click");
    expect(wrapper.emitted("create")).toHaveLength(1);
  });

  it("renders one card per route through the shared card shape, with distance/elevation meta", async () => {
    const wrapper = await mountWithRoutes([
      makeRoute(),
      makeRoute({ id: "route-2", name: "Parkweg", distanceM: 1000, geometrySource: "straight", elevationGainM: null }),
    ]);

    const cards = wrapper.findAll(".card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.find(".card-name").text()).toBe("Tempelhof-Runde");
    expect(cards[0]!.find(".card-meta").text()).toBe("6.40 km · 34 hm");
    expect(cards[1]!.find(".card-meta").text()).toBe("1.00 km ≈ · Höhe unbekannt");
  });

  it("opens the route detail screen on card click, not on Starten/menu clicks", async () => {
    const wrapper = await mountWithRoutes([makeRoute()]);
    const router = wrapper.vm.$router;
    const pushSpy = vi.spyOn(router, "push");

    await wrapper.find(".card").trigger("click");

    expect(pushSpy).toHaveBeenCalledWith("/routes/route-1");
  });

  it("emits start when Starten is clicked, without navigating", async () => {
    const wrapper = await mountWithRoutes([makeRoute()]);
    const router = wrapper.vm.$router;
    const pushSpy = vi.spyOn(router, "push");

    await wrapper.find(".card-actions .btn-secondary").trigger("click");

    expect(wrapper.emitted("start")?.[0]).toEqual([expect.objectContaining({ id: "route-1" })]);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("toggles the ⋮ menu and emits edit from it", async () => {
    const wrapper = await mountWithRoutes([makeRoute()]);

    expect(wrapper.find(".card-menu").exists()).toBe(false);
    await wrapper.find(".btn-icon").trigger("click");
    expect(wrapper.find(".card-menu").exists()).toBe(true);

    const editBtn = wrapper.findAll(".card-menu button").find((b) => b.text().includes("Bearbeiten"))!;
    await editBtn.trigger("click");

    expect(wrapper.emitted("edit")?.[0]).toEqual([expect.objectContaining({ id: "route-1" })]);
    expect(wrapper.find(".card-menu").exists()).toBe(false);
  });

  it("deletes the route on a second tap of the danger button", async () => {
    const wrapper = await mountWithRoutes([makeRoute()]);
    await wrapper.find(".btn-icon").trigger("click");
    const deleteBtn = () => wrapper.find(".card-menu button.danger");

    await deleteBtn().trigger("click");
    expect(deletePlannedRouteMock).not.toHaveBeenCalled();
    expect(deleteBtn().text()).toBe("Wirklich löschen?");

    await deleteBtn().trigger("click");
    expect(deletePlannedRouteMock).toHaveBeenCalledWith("route-1");
  });

  it("closes the menu on an outside click", async () => {
    const wrapper = await mountWithRoutes([makeRoute()]);
    await wrapper.find(".btn-icon").trigger("click");
    expect(wrapper.find(".card-menu").exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(wrapper.find(".card-menu").exists()).toBe(false);
  });
});
