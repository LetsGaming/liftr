// RouteWizard.vue owns a debounced lifecycle (400 ms) across three collaborators: the loop
// generator (@liftr/shared, left REAL here — the point of this file is the integration), the
// planned-route API (mocked: previewPlannedRoute and getPlannedRouteDetail both hit the network)
// and the planned-route store (mocked: create/update hit the network and reload the list).
// RouteMapEditor is stubbed because the real one imports leaflet and needs a live DOM map; only its
// add/move/remove emit contract matters to this component's logic. SheetModal is stubbed the same
// way RoutineWizard.test.ts and RunDetail.test.ts stub it — see tests/README.md on stubbing an
// Ionic-backed element rather than loading the real Stencil runtime.
//
// Fake timers are load-bearing, not a speed-up: the 400 ms debounce is exactly what findings B1-B3
// are about, and every test here needs to control whether it has fired.
//
// Selectors below (input.name-input, .loop-toggle input, button.btn-primary) were confirmed
// against the real template as this task's first step — see the task's own note if they ever
// drift from the component again. input.name-input lives in the nested WizardHeader.vue (rendered
// into SheetModal's #header slot, which the stub below forwards unstubbed), not in RouteWizard.vue
// itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import RouteWizard from "~client/components/route-wizard/RouteWizard.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const { createMock, updateMock, previewMock, detailMock, sheetDismissSpy } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  previewMock: vi.fn(),
  detailMock: vi.fn(),
  sheetDismissSpy: vi.fn(),
}));

vi.mock("~client/stores/plannedRouteStore", () => ({
  usePlannedRouteStore: () => ({ create: createMock, update: updateMock }),
}));
vi.mock("~client/services/plannedRouteService", () => ({
  previewPlannedRoute: previewMock,
  getPlannedRouteDetail: detailMock,
}));

const SheetModalStub = defineComponent({
  emits: ["close"],
  methods: {
    dismiss() {
      sheetDismissSpy();
      this.$emit("close");
    },
  },
  template: `<div class="sheet-stub"><slot name="header" /><div class="sheet-body"><slot /></div></div>`,
});

const RouteMapEditorStub = defineComponent({
  name: "RouteMapEditor",
  props: ["waypoints", "routedPoints", "approximate", "initialCenter"],
  emits: ["add", "move", "remove"],
  template: `<div class="map-stub" :data-count="waypoints.length"></div>`,
});

function mountWizard(props: Record<string, unknown> = {}) {
  return mountWithProviders(RouteWizard, {
    props,
    global: { stubs: { SheetModal: SheetModalStub, RouteMapEditor: RouteMapEditorStub } },
  });
}

/** ~700 m apart in Berlin — comfortably over the generator's 50 m minimum chord. */
const A = { lat: 52.5, lon: 13.4 };
const B = { lat: 52.5045, lon: 13.412 };
const C = { lat: 52.506, lon: 13.4 };

type Wrapper = ReturnType<typeof mountWizard>;

function map(wrapper: Wrapper) {
  return wrapper.findComponent(RouteMapEditorStub);
}
function waypointsOf(wrapper: Wrapper): { lat: number; lon: number; gen?: boolean }[] {
  return map(wrapper).props("waypoints") as { lat: number; lon: number; gen?: boolean }[];
}
async function tap(wrapper: Wrapper, waypoint: { lat: number; lon: number }) {
  map(wrapper).vm.$emit("add", waypoint);
  await wrapper.vm.$nextTick();
}
async function settle(wrapper: Wrapper) {
  await vi.advanceTimersByTimeAsync(400);
  await wrapper.vm.$nextTick();
}
async function setName(wrapper: Wrapper, value: string) {
  await wrapper.find("input.name-input").setValue(value);
}

beforeEach(() => {
  vi.useFakeTimers();
  createMock.mockReset().mockResolvedValue({ id: "route-1" });
  updateMock.mockReset().mockResolvedValue(undefined);
  previewMock.mockReset().mockResolvedValue({
    points: [],
    distanceM: 1234,
    elevationGainM: null,
    geometrySource: "straight",
  });
  detailMock.mockReset().mockResolvedValue({ points: [] });
  sheetDismissSpy.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("RouteWizard loop arc lifecycle", () => {
  it("generates the arc once the debounce settles, not on the tap itself", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    expect(waypointsOf(wrapper).filter((w) => w.gen)).toHaveLength(0);

    await settle(wrapper);

    expect(waypointsOf(wrapper).filter((w) => w.gen).length).toBeGreaterThan(0);
  });

  it("waits for the user to stop tapping before deciding what the arc bridges", async () => {
    // Why generateArcIfNeeded rides the debounce at all: closeLoop defaults to true, so generating
    // on the 2nd tap would bridge only the first two points and ignore everything placed after.
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await vi.advanceTimersByTimeAsync(200);
    await tap(wrapper, B);
    await vi.advanceTimersByTimeAsync(200);
    expect(waypointsOf(wrapper).filter((w) => w.gen)).toHaveLength(0);

    await tap(wrapper, C);
    await settle(wrapper);

    const generated = waypointsOf(wrapper).filter((w) => w.gen);
    expect(generated.length).toBeGreaterThan(0);
    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(3);
  });

  it("strips the generated points when the loop toggle is switched off", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(true);

    await wrapper.find(".loop-toggle input").setValue(false);

    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(false);
  });

  it("saves the user's waypoints, the generated arc, and a closing copy of the first point", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Feierabendrunde");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    const [name, saved] = createMock.mock.calls[0]!;
    expect(name).toBe("Feierabendrunde");
    expect(saved.length).toBeGreaterThan(3);
    expect(saved[0]).toMatchObject({ lat: A.lat, lon: A.lon });
    expect(saved[saved.length - 1]).toMatchObject({ lat: A.lat, lon: A.lon });
  });

  it("hydrates a saved closed loop by stripping the duplicate closing point", async () => {
    const wrapper = mountWizard({
      route: {
        id: "route-1",
        name: "Gespeichert",
        orderIndex: 0,
        waypoints: [A, B, { ...A }],
        distanceM: 2000,
        elevationGainM: null,
        geometrySource: "straight",
        computedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        polyline: [],
      },
    });
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    expect(waypointsOf(wrapper)).toHaveLength(2);
    expect((wrapper.find(".loop-toggle input").element as HTMLInputElement).checked).toBe(true);
  });
});

describe("RouteWizard save (findings B1)", () => {
  it("generates the arc before saving when the user saves inside the debounce window", async () => {
    // A completely normal quick-create: two taps and Speichern within 400 ms. The old save() read
    // effectiveWaypoints synchronously while the arc's timer was still pending, so the route
    // persisted as [A, B, copyOfA] — a straight closing line with the box checked. Permanent,
    // because hydrateFrom deliberately never synthesises a missing arc on reload.
    const wrapper = mountWizard();
    await setName(wrapper, "Schnellrunde");
    await tap(wrapper, A);
    await tap(wrapper, B);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    const saved = createMock.mock.calls[0]![1] as { gen?: boolean }[];
    expect(saved.filter((w) => w.gen).length).toBeGreaterThan(0);
    expect(saved.length).toBeGreaterThan(3);
  });

  it("does not generate a second arc when one already exists at save time", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Schon fertig");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const beforeSave = waypointsOf(wrapper).filter((w) => w.gen).length;

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    const saved = createMock.mock.calls[0]![1] as { gen?: boolean }[];
    expect(saved.filter((w) => w.gen)).toHaveLength(beforeSave);
  });
});

describe("RouteWizard arc dismissal (findings B2)", () => {
  async function removeAt(wrapper: Wrapper, index: number) {
    map(wrapper).vm.$emit("remove", index);
    await wrapper.vm.$nextTick();
  }

  it("does not regenerate the arc after the user deletes its points one by one", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const withArc = waypointsOf(wrapper);
    const genCount = withArc.filter((w) => w.gen).length;
    expect(genCount).toBeGreaterThan(0);

    // Remove every generated point, pausing long enough between each for the debounce to settle —
    // exactly the pattern in the report. The old guard flipped the moment the last one went and a
    // brand-new arc appeared ~400 ms later, silently undoing the deletions.
    for (let i = 0; i < genCount; i++) {
      const idx = waypointsOf(wrapper).findIndex((w) => w.gen);
      await removeAt(wrapper, idx);
      await settle(wrapper);
    }

    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(false);
    expect(waypointsOf(wrapper)).toHaveLength(2);
  });

  it("keeps the points the user chose to keep when they delete only part of the arc", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const genCount = waypointsOf(wrapper).filter((w) => w.gen).length;

    await removeAt(wrapper, waypointsOf(wrapper).findIndex((w) => w.gen));
    await settle(wrapper);

    expect(waypointsOf(wrapper).filter((w) => w.gen)).toHaveLength(genCount - 1);
  });

  it("brings a fresh arc back when the user toggles the loop off and on again", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    await removeAt(wrapper, waypointsOf(wrapper).findIndex((w) => w.gen));
    await settle(wrapper);

    await wrapper.find(".loop-toggle input").setValue(false);
    await wrapper.find(".loop-toggle input").setValue(true);
    await settle(wrapper);

    expect(waypointsOf(wrapper).filter((w) => w.gen).length).toBeGreaterThan(0);
  });
});
