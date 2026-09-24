// RouteWizard.vue owns a debounced lifecycle (400 ms) across three collaborators: the loop
// generator (@liftr/shared, left REAL here — the point of this file is the integration), the
// planned-route API (mocked: previewPlannedRoute and getPlannedRouteDetail) and the planned-route
// store (mocked: create/update hit the network and reload the list). previewPlannedRoute is no
// longer called from manual editing (see docs/adr/0009-street-aware-loop-closure-via-avoid-polygons.md)
// — it only fires once, for the seeded-from-a-recorded-run hydration path — so the 400 ms debounce
// below now only drives local arc (re)generation, not a network round trip.
// RouteMapEditor is stubbed because the real one imports leaflet and needs a live DOM map; only its
// add/move/remove emit contract matters to this component's logic. SheetModal is stubbed the same
// way RoutineWizard.test.ts and RunDetail.test.ts stub it — see tests/README.md on stubbing an
// Ionic-backed element rather than loading the real Stencil runtime.
//
// Fake timers are load-bearing, not a speed-up: the 400 ms debounce is exactly what findings B1-B3
// are about, and every test here needs to control whether it has fired.
//
// Selectors below (input.base-header-name-input, .loop-toggle input, button.btn-primary) were confirmed
// against the real template as this task's first step — see the task's own note if they ever
// drift from the component again. input.base-header-name-input lives in the nested WizardHeader.vue (rendered
// into SheetModal's #header slot, which the stub below forwards unstubbed), not in RouteWizard.vue
// itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteWizard from "~client/components/route/RouteWizard.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import { createSheetModalStub } from "../../helpers/stubRouteWizardSheet";
import { RouteMapEditorStub } from "../../helpers/stubRouteMapEditor";

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

const SheetModalStub = createSheetModalStub(sheetDismissSpy);

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
  await wrapper.find("input.base-header-name-input").setValue(value);
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
beforeEach(async () => {
  // useToast's `toasts` is module-level reactive state shared across every test file that mounts
  // it — splice it clean so a toast left over from a previous test doesn't bleed into this file's
  // assertions (same pattern RoutineWizard.test.ts uses).
  const { toasts } = await import("~client/composables/useToast").then((m) => m.useToast());
  toasts.splice(0, toasts.length);
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

describe("RouteWizard late taps (findings B3)", () => {
  async function removeAt(wrapper: Wrapper, index: number) {
    map(wrapper).vm.$emit("remove", index);
    await wrapper.vm.$nextTick();
  }

  it("never leaves a generated point ahead of a user-placed one", async () => {
    // tap, tap, pause (arc generates), tap again — the old onAdd appended after the gen block and
    // generateArcIfNeeded no-opped for the rest of the session, producing a visible zigzag that
    // saved without error.
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(true);

    await tap(wrapper, C);
    await settle(wrapper);

    const list = waypointsOf(wrapper);
    const lastUser = list.reduce((acc, w, i) => (w.gen ? acc : i), -1);
    const firstGen = list.findIndex((w) => w.gen);
    expect(firstGen).toBeGreaterThan(lastUser);
    expect(list.filter((w) => !w.gen)).toHaveLength(3);
  });

  it("rebuilds the arc from the updated path rather than keeping the stale one", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const before = waypointsOf(wrapper).filter((w) => w.gen);

    await tap(wrapper, C);
    await settle(wrapper);
    const after = waypointsOf(wrapper).filter((w) => w.gen);

    expect(after.length).toBeGreaterThan(0);
    expect(after[0]).not.toEqual(before[0]);
  });

  it("keeps a dismissed arc's surviving points in place when a new waypoint is tapped", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const genCount = waypointsOf(wrapper).filter((w) => w.gen).length;
    await removeAt(wrapper, waypointsOf(wrapper).findIndex((w) => w.gen));
    await settle(wrapper);

    await tap(wrapper, C);
    await settle(wrapper);

    const list = waypointsOf(wrapper);
    expect(list.filter((w) => w.gen)).toHaveLength(genCount - 1);
    const lastUser = list.reduce((acc, w, i) => (w.gen ? acc : i), -1);
    const firstGen = list.findIndex((w) => w.gen);
    expect(firstGen).toBeGreaterThan(lastUser);
  });
});

describe("RouteWizard waypoint cap and save errors (findings B4)", () => {
  async function tapMany(wrapper: Wrapper, n: number) {
    for (let i = 0; i < n; i++) {
      // A grid of distinct points, all well inside Berlin and all >50 m apart.
      await tap(wrapper, { lat: 52.5 + i * 0.001, lon: 13.4 + (i % 7) * 0.001 });
    }
  }

  it("refuses the tap that would exceed the waypoint budget and says so", async () => {
    const wrapper = mountWizard();
    await tapMany(wrapper, 46);
    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(46);

    await tap(wrapper, { lat: 52.6, lon: 13.5 });

    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(46);
    expect(wrapper.text()).toContain("46");
  });

  it("warns and blocks save when toggling the loop on pushes an already-placed count over its budget", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "ZuVoll");
    // Loop off (default true) so the loop-off cap (50) applies while placing — the full 50 is
    // fine with the loop off, but leaves no room at all for the loop-on synthetic closing point.
    await wrapper.find(".loop-toggle input").setValue(false);
    await tapMany(wrapper, 50);
    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(50);

    await wrapper.find(".loop-toggle input").setValue(true);

    const { toasts } = await import("~client/composables/useToast").then((m) => m.useToast());
    expect(toasts.map((t) => t.text).join(" ")).toContain("Mit Schleife sind maximal");
    expect(wrapper.find("button.btn-primary").attributes("disabled")).toBeDefined();
  });

  it("never builds a payload longer than the server's 50-waypoint limit", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Lang");
    await tapMany(wrapper, 46);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect((createMock.mock.calls[0]![1] as unknown[]).length).toBeLessThanOrEqual(50);
  });

  it("tells the user a rejected save will not succeed on retry", async () => {
    const { ApiError } = await import("~client/lib/api");
    createMock.mockRejectedValue(new ApiError("POST failed: 400", 400, "Array must contain at most 50 element(s)"));
    const wrapper = mountWizard();
    await setName(wrapper, "Abgelehnt");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    // Not vi.runAllTimersAsync() here: useToast's own auto-dismiss (2500 ms) would also run to
    // completion and splice the toast back out before this test ever inspects it. advanceTimersByTimeAsync(0)
    // still flushes the rejected-promise microtask chain that runs the catch handler, without racing the dismiss.
    await vi.advanceTimersByTimeAsync(0);

    const { toasts } = await import("~client/composables/useToast").then((m) => m.useToast());
    expect(toasts.map((t) => t.text).join(" ")).toContain("abgelehnt");
    expect(toasts.map((t) => t.text).join(" ")).not.toContain("bitte erneut versuchen");
  });

  it("still offers a retry for a transient failure", async () => {
    createMock.mockRejectedValue(new Error("network down"));
    const wrapper = mountWizard();
    await setName(wrapper, "Netzfehler");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    // See the previous test's note: bounded flush, not runAllTimersAsync, so the toast's own
    // auto-dismiss timer doesn't race the assertion.
    await vi.advanceTimersByTimeAsync(0);

    const { toasts } = await import("~client/composables/useToast").then((m) => m.useToast());
    expect(toasts.map((t) => t.text).join(" ")).toContain("bitte erneut versuchen");
  });
});

describe("RouteWizard makes no network calls while editing (ADR-0009)", () => {
  it("does not preview on a tap, before or after the debounce", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    expect(previewMock).not.toHaveBeenCalled();
    // The arc still generates locally — only the network call is gone.
    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(true);
  });

  it("does not preview on a marker drag", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    map(wrapper).vm.$emit("move", 0, { lat: A.lat + 0.001, lon: A.lon });
    await wrapper.vm.$nextTick();
    await settle(wrapper);

    expect(previewMock).not.toHaveBeenCalled();
  });

  it("does not preview on a removal", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    map(wrapper).vm.$emit("remove", 0);
    await wrapper.vm.$nextTick();
    await settle(wrapper);

    expect(previewMock).not.toHaveBeenCalled();
  });

  it("does not preview when the loop toggle is flipped, in either direction", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find(".loop-toggle input").setValue(false);
    await settle(wrapper);
    await wrapper.find(".loop-toggle input").setValue(true);
    await settle(wrapper);

    expect(previewMock).not.toHaveBeenCalled();
  });

  it("does not preview when a saved route is opened for editing", async () => {
    const wrapper = mountWizard({
      route: {
        id: "route-1",
        name: "Gespeichert",
        orderIndex: 0,
        waypoints: [A, B, { ...A }],
        distanceM: 2000,
        elevationGainM: null,
        geometrySource: "ors",
        computedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        polyline: [],
      },
    });
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("still previews exactly once when seeded from a recorded track", async () => {
    const wrapper = mountWizard({ seedWaypoints: [A, B, C] });
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    expect(previewMock).toHaveBeenCalledTimes(1);
  });

  it("drops the saved snapped line back to the local approximate one on the first edit", async () => {
    detailMock.mockResolvedValueOnce({ points: [{ idx: 0, lat: A.lat, lon: A.lon, ele: null }, { idx: 1, lat: B.lat, lon: B.lon, ele: null }] });
    const wrapper = mountWizard({
      route: {
        id: "route-1",
        name: "Gespeichert",
        orderIndex: 0,
        waypoints: [A, B, { ...A }],
        distanceM: 2000,
        elevationGainM: null,
        geometrySource: "ors",
        computedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        polyline: [],
      },
    });
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();
    expect((map(wrapper).props("routedPoints") as unknown[]).length).toBeGreaterThan(0);
    expect(map(wrapper).props("approximate")).toBe(false);

    map(wrapper).vm.$emit("move", 0, { lat: A.lat + 0.001, lon: A.lon });
    await wrapper.vm.$nextTick();

    expect(map(wrapper).props("routedPoints")).toEqual([]);
    expect(map(wrapper).props("approximate")).toBe(true);
  });

  it("keeps the hydrated line when a tap is refused by the waypoint budget", async () => {
    const wrapper = mountWizard();
    for (let i = 0; i < 46; i++) {
      await tap(wrapper, { lat: 52.5 + i * 0.001, lon: 13.4 + (i % 7) * 0.001 });
    }
    await settle(wrapper);
    const before = map(wrapper).props("routedPoints");

    await tap(wrapper, { lat: 52.6, lon: 13.5 }); // refused — over budget

    expect(map(wrapper).props("routedPoints")).toBe(before);
  });

  it("passes closeLoop through to the map as :closed", async () => {
    const wrapper = mountWizard();
    expect(map(wrapper).props("closed")).toBe(true); // default

    await wrapper.find(".loop-toggle input").setValue(false);
    expect(map(wrapper).props("closed")).toBe(false);
  });

  it("saves without any preview round-trip", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Ohne Vorschau");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(previewMock).not.toHaveBeenCalled();
  });
});
