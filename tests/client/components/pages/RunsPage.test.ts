// RunsPage.vue mirrors WorkoutPage.vue's flat structure: no sub-tabs, RouteList (stubbed here —
// its own rendering is RouteList's concern) is the page's primary content. Individual-run
// browsing (history, replay, rank/PR chips, delete) moved to RunDetail.vue (see
// RunDetail.test.ts), reached from OverviewPage.vue's "Letzte Aktivität" — this file only tests
// RunsPage's own remaining job: loading runs/routes, the manual-entry/import actions, and wiring
// RouteList's edit/start/create events to the route wizard and the manual pre-fill flow.
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { reactive } from "vue";
import RouteList from "~client/components/route/RouteList.vue";
import RouteWizard from "~client/components/route-wizard/RouteWizard.vue";
import RunsPage from "~client/pages/RunsPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

interface RunSummary {
  id: string;
  name: string | null;
  startedAt: string;
  distanceM: number;
  avgPaceSPerKm: number | null;
  source: string;
}

// `reactive` isn't available inside vi.hoisted()'s factory (it runs before "vue" itself has been
// linked, per this project's vi.mock hoisting) — declared as a plain top-of-file const instead,
// referenced only inside an uninvoked closure below (tests/README's documented TDZ workaround).
const runsStore = reactive({
  runs: [] as RunSummary[],
  loaded: false,
  load: vi.fn(),
  loadDetail: vi.fn(),
  importFile: vi.fn(),
  logManual: vi.fn(),
});
vi.mock("~client/stores/runsStore", () => ({
  useRunsStore: () => runsStore,
}));

const RouteListStub = { template: "<div class='route-list-stub' />" };
const RouteWizardStub = {
  props: ["route", "initialCenter"],
  template: "<div class='route-wizard-stub' />",
};
const STUBS = { RouteList: RouteListStub, RouteWizard: RouteWizardStub };

beforeEach(() => {
  vi.clearAllMocks();
  runsStore.runs = [];
  runsStore.loaded = false;
  runsStore.load.mockImplementation(async () => {
    runsStore.loaded = true;
  });
});

describe("RunsPage", () => {
  it("loads runs on mount", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushPromises();

    expect(runsStore.load).toHaveBeenCalledOnce();
    expect(wrapper.findComponent(RouteList).exists()).toBe(true);
  });

  it("opens the route wizard when RouteList emits create", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushPromises();

    expect(wrapper.findComponent(RouteWizard).exists()).toBe(false);
    await wrapper.findComponent(RouteList).vm.$emit("create");
    await flushPromises();

    expect(wrapper.findComponent(RouteWizard).exists()).toBe(true);
  });

  it("opens the route wizard in edit mode when RouteList emits edit", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushPromises();

    const route = { id: "route1", name: "Tempelhof-Runde", distanceM: 6400 };
    await wrapper.findComponent(RouteList).vm.$emit("edit", route);
    await flushPromises();

    const wizard = wrapper.findComponent(RouteWizard);
    expect(wizard.exists()).toBe(true);
    expect(wizard.props("route")).toStrictEqual(route);
  });

  it("navigates straight to live tracking when RouteList emits start, not the manual form", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushPromises();
    const router = wrapper.vm.$router;
    const pushSpy = vi.spyOn(router, "push");

    const route = { id: "route1", name: "Tempelhof-Runde", distanceM: 6400, elevationGainM: 34, geometrySource: "ors" };
    await wrapper.findComponent(RouteList).vm.$emit("start", route);
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith("/routes/route1?autostart=live");
    expect(wrapper.find(".route-banner").exists()).toBe(false);
    expect(wrapper.find(".manual-form").exists()).toBe(false);
  });

  it("toggles the manual entry form via the 'Manuell' button", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushPromises();

    expect(wrapper.find(".manual-form").exists()).toBe(false);
    await wrapper.find(".pagehead .btn-secondary").trigger("click");
    expect(wrapper.find(".manual-form").exists()).toBe(true);
  });

  it("surfaces a client-side validation error instead of submitting an invalid manual entry", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushPromises();

    await wrapper.find(".pagehead .btn-secondary").trigger("click"); // "Manuell"
    await wrapper.find(".manual-form .btn-primary").trigger("click"); // submit with empty fields

    expect(runsStore.logManual).not.toHaveBeenCalled();
    expect(wrapper.find(".manual-form .error").text()).toContain("Bitte eine Distanz in km angeben.");
  });
});
