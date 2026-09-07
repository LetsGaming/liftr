// RunMap.vue draws a real Leaflet map onto the DOM, which needs real layout (getBoundingClientRect
// etc.) jsdom doesn't fully provide. Rather than fighting that, `leaflet` itself is mocked (see
// tests/README.md's idb/@capacitor note — vitest.config.ts now has the same resolve.alias entry
// for the bare "leaflet" specifier, since it's a client-only dependency not hoisted to the root
// package.json, so this file's vi.mock("leaflet", ...) actually intercepts what RunMap.vue's own
// `import L from "leaflet"` resolves to) with lightweight fakes that record every call, so this
// tests RunMap's own lifecycle/prop-handling logic — what it draws and when — without needing a
// real map renderer.
//
// mapMock/tileLayerMock/polylineMock/circleMarkerMock are read directly (by value) inside the
// vi.mock("leaflet", ...) factory below, so — per tests/README.md's vi.hoisted() note — they're
// declared via vi.hoisted() rather than a plain same-file const, dodging the TDZ crash a plain
// const would hit (vi.mock's factory runs before those consts would otherwise be initialized).
// The mocks' own bodies close over `layers`/`mapRecords`/`circleMarkers` (declared further down)
// only inside nested, uninvoked functions — those aren't dereferenced until a test actually
// mounts RunMap, well after the whole module has finished initializing, so no second TDZ hazard.
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunMap from "~client/components/run/RunMap.vue";
import type { RunPoint } from "~client/stores/runsStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

interface FakeLayer {
  kind: string;
  addTo: (map: unknown) => FakeLayer;
}
interface FakeCircleMarker extends FakeLayer {
  setLatLng: (latlng: unknown) => void;
}
interface FakeMapRecord {
  removed: boolean;
  fitBoundsCalls: unknown[];
}

let layers: FakeLayer[] = [];
let mapRecords: FakeMapRecord[] = [];
let circleMarkers: FakeCircleMarker[] = [];

function makeLayer(kind: string): FakeLayer {
  const layer: FakeLayer = {
    kind,
    addTo: vi.fn(() => {
      layers.push(layer);
      return layer;
    }),
  };
  return layer;
}

const { mapMock, tileLayerMock, polylineMock, circleMarkerMock } = vi.hoisted(() => ({
  mapMock: vi.fn(),
  tileLayerMock: vi.fn(),
  polylineMock: vi.fn(),
  circleMarkerMock: vi.fn(),
}));

mapMock.mockImplementation((_container: unknown, _opts: unknown) => {
  const record: FakeMapRecord = { removed: false, fitBoundsCalls: [] };
  mapRecords.push(record);
  return {
    eachLayer: (cb: (l: FakeLayer) => void) => layers.forEach(cb),
    removeLayer: (l: FakeLayer) => {
      layers = layers.filter((x) => x !== l);
    },
    fitBounds: (bounds: unknown, opts: unknown) => {
      record.fitBoundsCalls.push({ bounds, opts });
    },
    remove: () => {
      record.removed = true;
    },
  };
});
tileLayerMock.mockImplementation((_url: string, _opts: unknown) => makeLayer("tile"));
polylineMock.mockImplementation((_latlngs: unknown, _opts: unknown) => {
  const layer = makeLayer("polyline");
  return { ...layer, getBounds: () => ({}) };
});
circleMarkerMock.mockImplementation((_latlng: unknown, _opts: unknown) => {
  const layer = makeLayer("circleMarker") as FakeCircleMarker;
  layer.setLatLng = vi.fn();
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

function makePoint(overrides: Partial<RunPoint> = {}): RunPoint {
  return { idx: 0, t: "2026-03-15T07:00:00.000Z", lat: 52.5, lon: 13.4, ele: null, hr: null, cadence: null, ...overrides };
}

beforeEach(() => {
  layers = [];
  mapRecords = [];
  circleMarkers = [];
  mapMock.mockClear();
  tileLayerMock.mockClear();
  polylineMock.mockClear();
  circleMarkerMock.mockClear();
});

describe("RunMap", () => {
  it("creates a Leaflet map with an OSM tile layer on mount", () => {
    mountWithProviders(RunMap, { props: { points: [] } });

    expect(mapMock).toHaveBeenCalledTimes(1);
    expect(mapMock.mock.calls[0]![1]).toEqual({ attributionControl: true, zoomControl: true });
    expect(tileLayerMock).toHaveBeenCalledTimes(1);
    expect(tileLayerMock.mock.calls[0]![0]).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("draws nothing but the tile layer when there are no points yet", () => {
    mountWithProviders(RunMap, { props: { points: [] } });

    expect(layers.map((l) => l.kind)).toEqual(["tile"]);
  });

  it("draws a polyline through the given points and fits the map to its bounds", () => {
    const points = [makePoint({ lat: 52.5, lon: 13.4 }), makePoint({ idx: 1, lat: 52.51, lon: 13.41 })];
    mountWithProviders(RunMap, { props: { points } });

    expect(polylineMock).toHaveBeenCalledTimes(1);
    expect(polylineMock.mock.calls[0]![0]).toEqual([
      [52.5, 13.4],
      [52.51, 13.41],
    ]);
    expect(mapRecords[0]!.fitBoundsCalls).toHaveLength(1);
  });

  it("draws start/end/replay circle markers", () => {
    mountWithProviders(RunMap, { props: { points: [makePoint()] } });

    expect(circleMarkerMock).toHaveBeenCalledTimes(3); // start, end, replay marker
  });

  it("re-renders (clearing prior layers except the tile layer) when points change", async () => {
    const wrapper = mountWithProviders(RunMap, { props: { points: [makePoint()] } });
    const layersAfterFirstRender = layers.length;
    expect(layersAfterFirstRender).toBeGreaterThan(1);

    await wrapper.setProps({ points: [makePoint(), makePoint({ idx: 1, lat: 52.6, lon: 13.5 })] });

    // the tile layer survives every re-render; everything else gets cleared + redrawn (same
    // shape regardless of point count: 1 line + 2 boundary markers + 1 replay marker)
    expect(layers.filter((l) => l.kind === "tile")).toHaveLength(1);
    expect(layers.length).toBe(layersAfterFirstRender);
  });

  it("exposes setMarkerPosition, which moves only the replay marker (not the start/end ones)", () => {
    const wrapper = mountWithProviders(RunMap, { props: { points: [makePoint()] } });

    (wrapper.vm as unknown as { setMarkerPosition: (lat: number, lon: number) => void }).setMarkerPosition(1, 2);

    const replayMarker = circleMarkers[circleMarkers.length - 1]!;
    expect(replayMarker.setLatLng).toHaveBeenCalledWith([1, 2]);
    for (const m of circleMarkers.slice(0, -1)) {
      expect(m.setLatLng).not.toHaveBeenCalled();
    }
  });

  it("removes the map on unmount", () => {
    const wrapper = mountWithProviders(RunMap, { props: { points: [] } });

    wrapper.unmount();

    expect(mapRecords[0]!.removed).toBe(true);
  });
});
