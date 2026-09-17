// RouteOverviewPage.vue is the running-side counterpart to RoutineOverviewPage.vue: a route
// card's drill-in screen with a sticky start bar offering live GPS tracking or manual entry.
// This file covers the `?autostart=live` deep link (RunsPage.vue's card "Starten" button now
// navigates here instead of opening the manual form directly — see RunsPage.test.ts) plus the
// page's own "Manuell eintragen" button, which must stay unaffected by that change.
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { i18n } from "~client/i18n";
import LiveRunScreen from "~client/components/run/LiveRunScreen.vue";
import RouteOverviewPage from "~client/pages/RouteOverviewPage.vue";

interface PlannedRoute {
  id: string;
  name: string;
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: string;
  waypoints: unknown[];
  polyline: unknown[];
}

// Plain top-of-file const referenced only inside an uninvoked closure below — `reactive` isn't
// available inside vi.mock's hoisted factory (see RunsPage.test.ts's identical comment).
const plannedRouteState = reactive({
  routes: [] as PlannedRoute[],
  loaded: false,
  byId: (id: string) => plannedRouteState.routes.find((r) => r.id === id),
});
const runsStore = reactive({ logManual: vi.fn() });

vi.mock("~client/stores/plannedRouteStore", () => ({ usePlannedRouteStore: () => plannedRouteState }));
vi.mock("~client/stores/runsStore", () => ({ useRunsStore: () => runsStore }));

const STUBS = { LiveRunScreen: true, RunMap: true };

function makeRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route1",
    name: "Tempelhof-Runde",
    distanceM: 6400,
    elevationGainM: 34,
    geometrySource: "ors",
    waypoints: [{}],
    polyline: [],
    ...overrides,
  };
}

async function mountAtRoute(pathAndQuery: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/routes/:id", name: "route-overview", component: RouteOverviewPage },
      { path: "/runs", name: "runs", component: { template: "<div />" } },
    ],
  });
  await router.push(pathAndQuery);
  await router.isReady();
  const wrapper = mount(RouteOverviewPage, { global: { plugins: [createPinia(), i18n, router], stubs: STUBS } });
  return { wrapper, router: router as Router };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(plannedRouteState, { routes: [makeRoute()], loaded: true });
});

describe("RouteOverviewPage", () => {
  it("opens live tracking directly when navigated to with ?autostart=live, not the manual form", async () => {
    const { wrapper } = await mountAtRoute("/routes/route1?autostart=live");

    expect(wrapper.findComponent(LiveRunScreen).exists()).toBe(true);
    expect(wrapper.find(".manual-form").exists()).toBe(false);
  });

  it("strips the autostart query param after consuming it", async () => {
    const { router } = await mountAtRoute("/routes/route1?autostart=live");
    await vi.waitFor(() => expect(router.currentRoute.value.query.autostart).toBeUndefined());
    expect(router.currentRoute.value.path).toBe("/routes/route1");
  });

  it("does not auto-open live tracking without the query param", async () => {
    const { wrapper } = await mountAtRoute("/routes/route1");

    expect(wrapper.findComponent(LiveRunScreen).exists()).toBe(false);
  });

  it("still opens the manual form via 'Manuell eintragen', pre-filled from the route", async () => {
    const { wrapper } = await mountAtRoute("/routes/route1");

    expect(wrapper.find(".manual-form").exists()).toBe(false);
    await wrapper.find(".ro-start-bar .btn-secondary").trigger("click");

    expect(wrapper.findComponent(LiveRunScreen).exists()).toBe(false);
    const form = wrapper.find(".manual-form");
    expect(form.exists()).toBe(true);
    const kmInput = form.find<HTMLInputElement>("input[placeholder='km']");
    expect(kmInput.element.value).toBe("6,40");
  });

  it("still opens live tracking via 'Live tracken' when tapped directly", async () => {
    const { wrapper } = await mountAtRoute("/routes/route1");

    await wrapper.find(".ro-start-bar .btn-primary").trigger("click");

    expect(wrapper.findComponent(LiveRunScreen).exists()).toBe(true);
  });
});
