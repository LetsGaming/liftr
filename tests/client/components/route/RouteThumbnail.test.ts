import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  ioCallback: null as ((entries: { isIntersecting: boolean }[]) => void) | null,
  roCallback: null as (() => void) | null,
};

const fakeLine = { addTo: vi.fn().mockReturnThis(), getBounds: vi.fn(() => ({})) };
const fakeMap = {
  invalidateSize: vi.fn(),
  fitBounds: vi.fn(),
  remove: vi.fn(),
};

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => fakeMap),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    polyline: vi.fn(() => fakeLine),
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

import RouteThumbnail from "~client/components/route/RouteThumbnail.vue";

const points = [{ lat: 52.47, lon: 13.4 }, { lat: 52.48, lon: 13.41 }];

beforeEach(() => {
  state.ioCallback = null;
  state.roCallback = null;
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    cb();
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

describe("RouteThumbnail", () => {
  it("does not create a map before the container intersects the viewport", async () => {
    const { map } = await import("leaflet").then((m) => m.default as unknown as { map: ReturnType<typeof vi.fn> });
    mount(RouteThumbnail, { props: { points } });
    await Promise.resolve();

    expect(map).not.toHaveBeenCalled();
  });

  it("creates the map and fits bounds once the container intersects", async () => {
    const { map } = await import("leaflet").then((m) => m.default as unknown as { map: ReturnType<typeof vi.fn> });
    mount(RouteThumbnail, { props: { points } });
    await Promise.resolve();

    state.ioCallback?.([{ isIntersecting: true }]);
    await Promise.resolve();

    expect(map).toHaveBeenCalledTimes(1);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("re-invalidates size and re-fits bounds on a container resize", async () => {
    mount(RouteThumbnail, { props: { points } });
    await Promise.resolve();
    state.ioCallback?.([{ isIntersecting: true }]);
    await Promise.resolve();
    fakeMap.fitBounds.mockClear();

    state.roCallback?.();
    await Promise.resolve();

    expect(fakeMap.invalidateSize).toHaveBeenCalledTimes(1);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("tears the map down on unmount", async () => {
    const wrapper = mount(RouteThumbnail, { props: { points } });
    await Promise.resolve();
    state.ioCallback?.([{ isIntersecting: true }]);
    await Promise.resolve();

    wrapper.unmount();

    expect(fakeMap.remove).toHaveBeenCalledTimes(1);
  });

  it("never creates a map for fewer than 2 points", async () => {
    const { map } = await import("leaflet").then((m) => m.default as unknown as { map: ReturnType<typeof vi.fn> });
    mount(RouteThumbnail, { props: { points: [{ lat: 1, lon: 2 }] } });
    await Promise.resolve();

    expect(map).not.toHaveBeenCalled();
  });
});
