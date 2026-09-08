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

import RouteMapEditor from "~client/components/route/RouteMapEditor.vue";

beforeEach(() => {
  state.clickHandler = null;
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());
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
});
