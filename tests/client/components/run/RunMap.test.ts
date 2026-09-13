// RunMap.vue mounts LeafletMapBase.vue (see LeafletMapBase.test.ts) for the actual Leaflet
// instance/tile layer/resize handling, and only owns drawing its own polyline + circle markers
// in response to `ready`. So "leaflet" is mocked the same lightweight way LeafletMapBase.test.ts
// and RouteMapEditor.test.ts do — lightweight fakes that record every call — and this file only
// tests RunMap's own render/prop-handling logic, not the map lifecycle LeafletMapBase already
// covers on its own.
//
// mapMock/tileLayerMock/polylineMock/circleMarkerMock are read directly (by value) inside the
// vi.mock("leaflet", ...) factory below, so — per tests/README.md's vi.hoisted() note — they're
// declared via vi.hoisted() rather than a plain same-file const, dodging the TDZ crash a plain
// const would hit (vi.mock's factory runs before those consts would otherwise be initialized).
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunMap from "~client/components/run/RunMap.vue";
import type { RunPoint } from "~client/stores/runsStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

interface FakeLayer {
  kind: string;
  addTo: (map: unknown) => FakeLayer;
  remove: () => void;
}
interface FakeCircleMarker extends FakeLayer {
  setLatLng: (latlng: unknown) => void;
}

let addedLayers: FakeLayer[] = [];
let circleMarkers: FakeCircleMarker[] = [];
let fitBoundsCalls: unknown[] = [];

function makeLayer(kind: string): FakeLayer {
  const layer: FakeLayer = { kind, addTo: vi.fn(), remove: vi.fn() };
  layer.addTo = vi.fn(() => layer);
  return layer;
}

const { mapMock, tileLayerMock, polylineMock, circleMarkerMock } = vi.hoisted(() => ({
  mapMock: vi.fn(),
  tileLayerMock: vi.fn(),
  polylineMock: vi.fn(),
  circleMarkerMock: vi.fn(),
}));

const fakeMap = {
  fitBounds: vi.fn((bounds: unknown, opts: unknown) => {
    fitBoundsCalls.push({ bounds, opts });
  }),
};

mapMock.mockImplementation(() => fakeMap);
tileLayerMock.mockImplementation(() => ({ addTo: vi.fn() }));
polylineMock.mockImplementation((_latlngs: unknown, _opts: unknown) => {
  const layer = makeLayer("polyline") as FakeLayer & { getBounds: () => unknown };
  layer.getBounds = () => ({});
  addedLayers.push(layer);
  return layer;
});
circleMarkerMock.mockImplementation((_latlng: unknown, _opts: unknown) => {
  const layer = makeLayer("circleMarker") as FakeCircleMarker;
  layer.setLatLng = vi.fn();
  addedLayers.push(layer);
  circleMarkers.push(layer);
  return layer;
});

vi.mock("leaflet", () => ({
  default: {
    map: mapMock,
    tileLayer: tileLayerMock,
    polyline: polylineMock,
    circleMarker: circleMarkerMock,
  },
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

function makePoint(overrides: Partial<RunPoint> = {}): RunPoint {
  return { idx: 0, t: "2026-03-15T07:00:00.000Z", lat: 52.5, lon: 13.4, ele: null, hr: null, cadence: null, ...overrides };
}

beforeEach(() => {
  addedLayers = [];
  circleMarkers = [];
  fitBoundsCalls = [];
  mapMock.mockClear();
  tileLayerMock.mockClear();
  polylineMock.mockClear();
  circleMarkerMock.mockClear();
  fakeMap.fitBounds.mockClear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

describe("RunMap", () => {
  it("mounts LeafletMapBase, which creates the map and OSM tile layer", async () => {
    mountWithProviders(RunMap, { props: { points: [] } });
    await Promise.resolve();

    expect(mapMock).toHaveBeenCalledTimes(1);
    expect(tileLayerMock).toHaveBeenCalledTimes(1);
  });

  it("draws nothing when there are no points yet", async () => {
    mountWithProviders(RunMap, { props: { points: [] } });
    await Promise.resolve();

    expect(addedLayers).toHaveLength(0);
  });

  it("draws a polyline through the given points and fits the map to its bounds", async () => {
    const points = [makePoint({ lat: 52.5, lon: 13.4 }), makePoint({ idx: 1, lat: 52.51, lon: 13.41 })];
    mountWithProviders(RunMap, { props: { points } });
    await Promise.resolve();

    expect(polylineMock).toHaveBeenCalledTimes(1);
    expect(polylineMock.mock.calls[0]![0]).toEqual([
      [52.5, 13.4],
      [52.51, 13.41],
    ]);
    expect(fitBoundsCalls).toHaveLength(1);
  });

  it("draws start/end/replay circle markers", async () => {
    mountWithProviders(RunMap, { props: { points: [makePoint()] } });
    await Promise.resolve();

    expect(circleMarkerMock).toHaveBeenCalledTimes(3); // start, end, replay marker
  });

  it("removes the prior render's layers and redraws when points change", async () => {
    const wrapper = mountWithProviders(RunMap, { props: { points: [makePoint()] } });
    await Promise.resolve();
    const firstRenderLayers = [...addedLayers];
    expect(firstRenderLayers).toHaveLength(4); // 1 line + start + end + replay marker

    await wrapper.setProps({ points: [makePoint(), makePoint({ idx: 1, lat: 52.6, lon: 13.5 })] });

    for (const layer of firstRenderLayers) {
      expect(layer.remove).toHaveBeenCalledTimes(1);
    }
    // same shape regardless of point count: 1 line + 2 boundary markers + 1 replay marker
    expect(addedLayers).toHaveLength(firstRenderLayers.length + 4);
  });

  it("exposes setMarkerPosition, which moves only the replay marker (not the start/end ones)", async () => {
    const wrapper = mountWithProviders(RunMap, { props: { points: [makePoint()] } });
    await Promise.resolve();

    (wrapper.vm as unknown as { setMarkerPosition: (lat: number, lon: number) => void }).setMarkerPosition(1, 2);

    const replayMarker = circleMarkers[circleMarkers.length - 1]!;
    expect(replayMarker.setLatLng).toHaveBeenCalledWith([1, 2]);
    for (const m of circleMarkers.slice(0, -1)) {
      expect(m.setLatLng).not.toHaveBeenCalled();
    }
  });
});
