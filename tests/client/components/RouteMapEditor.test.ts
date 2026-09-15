import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { clickHandler: null as ((e: unknown) => void) | null };

vi.mock("leaflet", () => {
  const fakeMap = {
    setView: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: (e: unknown) => void) => {
      if (event === "click") state.clickHandler = handler;
    }),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
  };
  const fakeMarker = { on: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), getLatLng: vi.fn(() => ({ lat: 1, lng: 2 })) };
  const fakeLine = { addTo: vi.fn().mockReturnThis(), remove: vi.fn() };
  return {
    default: {
      map: vi.fn(() => fakeMap),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      marker: vi.fn(() => fakeMarker),
      polyline: vi.fn(() => fakeLine),
      divIcon: vi.fn(() => ({})),
      DomEvent: { stopPropagation: vi.fn() },
    },
  };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

import L from "leaflet";
import RouteMapEditor from "~client/components/route/RouteMapEditor.vue";

beforeEach(() => {
  state.clickHandler = null;
  vi.clearAllMocks(); // leaflet's mocked fns are module-level and otherwise accumulate calls across tests
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

describe("RouteMapEditor", () => {
  it("emits add with {lat,lon} from a map click", async () => {
    const wrapper = mount(RouteMapEditor, { props: { waypoints: [], routedPoints: [] } });
    await wrapper.vm.$nextTick();

    state.clickHandler?.({ latlng: { lat: 52.5, lng: 13.4 } });

    expect(wrapper.emitted("add")).toEqual([[{ lat: 52.5, lon: 13.4 }]]);
  });

  it("does not emit add when readonly", async () => {
    const wrapper = mount(RouteMapEditor, { props: { waypoints: [], routedPoints: [], readonly: true } });
    await wrapper.vm.$nextTick();

    state.clickHandler?.({ latlng: { lat: 52.5, lng: 13.4 } });

    expect(wrapper.emitted("add")).toBeUndefined();
  });

  it("emits remove with the last index from the 'Letzten Punkt entfernen' button", async () => {
    const wrapper = mount(RouteMapEditor, {
      props: { waypoints: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }], routedPoints: [] },
    });
    await wrapper.vm.$nextTick();

    await wrapper.find(".remove-last-btn").trigger("click");

    expect(wrapper.emitted("remove")).toEqual([[1]]);
  });

  describe("closed fallback line (no server geometry yet)", () => {
    const waypoints = [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: 5, lon: 6 }];

    it("draws the fallback line back to the first waypoint when closed", async () => {
      const wrapper = mount(RouteMapEditor, { props: { waypoints, routedPoints: [], closed: true } });
      await wrapper.vm.$nextTick();

      const latLngs = vi.mocked(L.polyline).mock.calls.at(-1)![0] as [number, number][];
      expect(latLngs).toHaveLength(4);
      expect(latLngs[3]).toEqual(latLngs[0]);
    });

    it("does not close the fallback line when closed is unset", async () => {
      const wrapper = mount(RouteMapEditor, { props: { waypoints, routedPoints: [] } });
      await wrapper.vm.$nextTick();

      const latLngs = vi.mocked(L.polyline).mock.calls.at(-1)![0] as [number, number][];
      expect(latLngs).toHaveLength(3);
    });

    it("does not close a server-provided routed line even when closed is set", async () => {
      const routedPoints = [
        { idx: 0, lat: 1, lon: 2, ele: null },
        { idx: 1, lat: 3, lon: 4, ele: null },
        { idx: 2, lat: 5, lon: 6, ele: null },
      ];
      const wrapper = mount(RouteMapEditor, { props: { waypoints, routedPoints, closed: true } });
      await wrapper.vm.$nextTick();

      const latLngs = vi.mocked(L.polyline).mock.calls.at(-1)![0] as [number, number][];
      expect(latLngs).toHaveLength(3); // real geometry already closes itself if it needs to
    });

    it("does not add a marker for the synthetic closing point", async () => {
      const wrapper = mount(RouteMapEditor, { props: { waypoints, routedPoints: [], closed: true } });
      await wrapper.vm.$nextTick();

      expect(vi.mocked(L.marker)).toHaveBeenCalledTimes(3); // still one per real waypoint, not 4
    });

    it("redraws when closed flips", async () => {
      const wrapper = mount(RouteMapEditor, { props: { waypoints, routedPoints: [], closed: false } });
      await wrapper.vm.$nextTick();
      const callsBefore = vi.mocked(L.polyline).mock.calls.length;

      await wrapper.setProps({ closed: true });
      await wrapper.vm.$nextTick();

      expect(vi.mocked(L.polyline).mock.calls.length).toBeGreaterThan(callsBefore);
      const latLngs = vi.mocked(L.polyline).mock.calls.at(-1)![0] as [number, number][];
      expect(latLngs).toHaveLength(4);
    });
  });
});
