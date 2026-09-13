// LeafletMapBase.vue is the single place that creates a Leaflet map instance, attaches the OSM
// tile layer, and keeps it correctly sized. It's mounted by RunMap/RouteMapEditor/RouteThumbnail,
// which is why this suite mocks "leaflet" the same lightweight way those components' own suites
// do (see RunMap.test.ts's header comment for the vi.hoisted()/alias rationale).
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  ioCallback: null as ((entries: { isIntersecting: boolean }[]) => void) | null,
  roCallback: null as (() => void) | null,
};

const fakeMap = {
  setView: vi.fn().mockReturnThis(),
  invalidateSize: vi.fn(),
  remove: vi.fn(),
};

const { mapMock, tileLayerMock } = vi.hoisted(() => ({
  mapMock: vi.fn(),
  tileLayerMock: vi.fn(),
}));

vi.mock("leaflet", () => ({
  default: {
    map: mapMock,
    tileLayer: tileLayerMock,
  },
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

class FakeIntersectionObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    state.ioCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

class FakeResizeObserver {
  constructor(cb: () => void) {
    state.roCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

import LeafletMapBase from "~client/components/map/LeafletMapBase.vue";

beforeEach(() => {
  state.ioCallback = null;
  state.roCallback = null;
  mapMock.mockReset();
  tileLayerMock.mockReset();
  mapMock.mockImplementation(() => fakeMap);
  tileLayerMock.mockImplementation(() => ({ addTo: vi.fn() }));
  fakeMap.setView.mockClear();
  fakeMap.invalidateSize.mockClear();
  fakeMap.remove.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    cb();
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

describe("LeafletMapBase", () => {
  it("creates a Leaflet map with an OSM tile layer immediately when not lazy", async () => {
    mount(LeafletMapBase);
    await Promise.resolve();

    expect(mapMock).toHaveBeenCalledTimes(1);
    expect(mapMock.mock.calls[0]![1]).toEqual({ attributionControl: true, zoomControl: true });
    expect(tileLayerMock).toHaveBeenCalledTimes(1);
  });

  it("merges mapOptions over the defaults", async () => {
    mount(LeafletMapBase, { props: { mapOptions: { zoomControl: false, dragging: false } } });
    await Promise.resolve();

    expect(mapMock.mock.calls[0]![1]).toEqual({ attributionControl: true, zoomControl: false, dragging: false });
  });

  it("applies initialView via setView when provided", async () => {
    mount(LeafletMapBase, { props: { initialView: { center: [52.5, 13.4], zoom: 14 } } });
    await Promise.resolve();

    expect(fakeMap.setView).toHaveBeenCalledWith([52.5, 13.4], 14);
  });

  it("does not create the map until the container intersects when lazy", async () => {
    mount(LeafletMapBase, { props: { lazy: true } });
    await Promise.resolve();

    expect(mapMock).not.toHaveBeenCalled();

    state.ioCallback?.([{ isIntersecting: true }]);
    await Promise.resolve();

    expect(mapMock).toHaveBeenCalledTimes(1);
  });

  it("emits ready with the created map instance", async () => {
    const wrapper = mount(LeafletMapBase);
    await Promise.resolve();

    expect(wrapper.emitted("ready")).toEqual([[fakeMap]]);
  });

  it("invalidates size on a container resize", async () => {
    mount(LeafletMapBase);
    await Promise.resolve();

    state.roCallback?.();
    await Promise.resolve();

    expect(fakeMap.invalidateSize).toHaveBeenCalledTimes(1);
  });

  it("emits resize after invalidating size, for consumers that need to react (e.g. re-fit bounds)", async () => {
    const wrapper = mount(LeafletMapBase);
    await Promise.resolve();

    state.roCallback?.();
    await Promise.resolve();

    expect(wrapper.emitted("resize")).toEqual([[]]);
  });

  it("exposes getMap and invalidateSize", async () => {
    const wrapper = mount(LeafletMapBase);
    await Promise.resolve();

    const vm = wrapper.vm as unknown as { getMap: () => unknown; invalidateSize: () => void };
    expect(vm.getMap()).toBe(fakeMap);

    vm.invalidateSize();
    expect(fakeMap.invalidateSize).toHaveBeenCalledTimes(1);
  });

  it("removes the map and disconnects observers on unmount", async () => {
    const wrapper = mount(LeafletMapBase);
    await Promise.resolve();

    wrapper.unmount();

    expect(fakeMap.remove).toHaveBeenCalledTimes(1);
  });
});
