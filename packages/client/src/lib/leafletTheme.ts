/**
 * Shared Leaflet setup for every map in the app: reading design tokens as CSS custom properties,
 * and the tile layers (standard + satellite). Single-user, low-volume interactive viewing is
 * within both providers' usage policies — no bulk prefetch, attribution shown; that reasoning
 * lives here once, not copy-pasted into every map component.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export type BasemapId = "standard" | "satellite";

export function createOsmTileLayer(): L.TileLayer {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  });
}

/**
 * Esri World Imagery: Maxar satellite + Vexcel aerial, sub-meter over most of Western Europe. No
 * API key and no server-side change, unlike every other satellite provider surveyed (Mapbox/
 * MapTiler/Stadia all require a key that would ship readable in the client bundle and the APK).
 * Esri's own terms expect attribution and nominally an ArcGIS developer account for non-OSM-
 * editing use of this tile service — see AttributionsPage.vue's entry — accepted as the tradeoff
 * for "works today with nothing to configure."
 *
 * NOTE the tile path is `{z}/{y}/{x}` — y before x — the reverse of `createOsmTileLayer`'s
 * `{z}/{x}/{y}` above. Swapping them silently loads plausible-looking imagery of the wrong place
 * rather than erroring, so don't "simplify" this to match the OSM URL shape.
 */
export function createSatelliteTileLayer(): L.TileLayer {
  return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles © Esri — Vantor, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  });
}

export function createTileLayer(basemap: BasemapId): L.TileLayer {
  return basemap === "satellite" ? createSatelliteTileLayer() : createOsmTileLayer();
}

/**
 * Transparent street/place-name labels for the satellite view — bare imagery is hard to orient
 * yourself in while placing route waypoints. Esri's own reference overlay, same host and same
 * no-API-key deal as createSatelliteTileLayer above, so it's covered by the same tradeoff already
 * accepted there. `zIndex: 2` (the base imagery layer defaults to 1) keeps it stacked above the
 * imagery within Leaflet's shared tilePane; route polylines/markers live in the higher overlayPane/
 * markerPane by default, so they stay on top of both without any extra pane work here.
 *
 * `attribution: ""` deliberately — createSatelliteTileLayer's own attribution already credits Esri
 * in the map's attribution control, and this layer's partner credits (HERE, Garmin, OSM
 * contributors) live in AttributionsPage.vue instead of getting appended as a second, differently
 * worded line in that small on-map corner.
 */
export function createLabelsTileLayer(): L.TileLayer {
  return L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    { attribution: "", maxZoom: 19, zIndex: 2 },
  );
}
