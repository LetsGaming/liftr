<script setup lang="ts">
/**
 * Route map: Leaflet + public OSM tiles, via LeafletMapBase (owns the tile layer / resize
 * handling). Also hosts the replay marker: `setMarkerPosition` is called every animation frame
 * by RunReplay.vue, kept as an imperative method rather than a reactive prop so replay doesn't
 * pay Vue's reactivity/diffing cost on every frame.
 */
import L from "leaflet";
import { watch } from "vue";
import LeafletMapBase from "../map/LeafletMapBase.vue";
import BasemapToggle from "../map/BasemapToggle.vue";
import { cssVar } from "../../lib/leafletTheme";

/** Only lat/lon are ever read below — a plain structural shape (not RunPoint) so this also
 *  accepts a planned route's Waypoint[] (RouteOverviewPage.vue's preview) without those callers
 *  needing to fabricate RunPoint's other fields (idx/t/ele/hr/cadence) they don't have. */
const props = defineProps<{ points: { lat: number; lon: number }[]; approximate?: boolean }>();

let map: L.Map | null = null;
let line: L.Polyline | null = null;
let startMarker: L.CircleMarker | null = null;
let endMarker: L.CircleMarker | null = null;
let marker: L.CircleMarker | null = null;
// Set once the user pans/zooms by hand — after that, a resize (soft keyboard, rotation, a sheet
// still settling into its final size) must not yank the view back to the route's bounds. Without
// this, `fit()` below re-running on every `@resize` would fight a user who just moved the map.
let userMoved = false;
// True for the duration of our own fit() call — Leaflet fires real "dragstart"/"zoomstart" events
// for ANY view change, including one it triggers itself via fitBounds/setView, not just ones a
// real drag/pinch caused. Without this guard, fit()'s own first call — often computed against a
// container that hasn't settled into its real on-screen size yet, badly over-zooming the initial
// view — would immediately flip `userMoved` to true via its own zoomstart event and permanently
// block the corrective re-fit that `handleResize` is there to make once the container's real size
// is known.
let programmaticMove = false;

/** Re-fits the view to the route's bounds. `animate: false` keeps this call synchronous, so the
 *  `programmaticMove` flag it sets around the fitBounds call below is guaranteed to still be true
 *  for the dragstart/zoomstart events that call fires — an animated fit raises its own internal
 *  move events later, after this function has already returned and reset the flag. */
function fit() {
  if (!map || !line) return;
  programmaticMove = true;
  map.fitBounds(line.getBounds(), { padding: [24, 24], animate: false });
  programmaticMove = false;
}

function render() {
  if (!map || props.points.length === 0) return;
  line?.remove();
  startMarker?.remove();
  endMarker?.remove();
  marker?.remove();

  const latLngs = props.points.map((p) => [p.lat, p.lon] as [number, number]);
  line = L.polyline(latLngs, {
    color: cssVar("--fire", "#ff7a1f"),
    weight: 4,
    opacity: 0.9,
    dashArray: props.approximate ? "4 4" : undefined,
  });
  line.addTo(map);
  fit();

  const ringColor = cssVar("--bg", "#0a0c14");
  startMarker = L.circleMarker(latLngs[0]!, { radius: 6, color: ringColor, weight: 2, fillColor: cssVar("--green", "#37d67a"), fillOpacity: 1 }).addTo(map);
  endMarker = L.circleMarker(latLngs[latLngs.length - 1]!, { radius: 6, color: ringColor, weight: 2, fillColor: cssVar("--red", "#ff4757"), fillOpacity: 1 }).addTo(map);

  marker = L.circleMarker(latLngs[0]!, { radius: 7, color: "#fff", weight: 2, fillColor: cssVar("--blue-hi", "#5ba0ff"), fillOpacity: 1 });
  marker.addTo(map);
}

function handleReady(m: L.Map) {
  map = m;
  m.on("dragstart", () => {
    if (!programmaticMove) userMoved = true;
  });
  m.on("zoomstart", () => {
    if (!programmaticMove) userMoved = true;
  });
  render();
}

/** LeafletMapBase's ResizeObserver-driven `invalidateSize()` fixes the map's pixel size but has
 *  no idea what bounds it should be framing — without this, a map created while its container was
 *  still settling into its final size (a sheet modal's open transition, a flex layout resolving)
 *  keeps whatever zoom it originally computed for the wrong-sized box. Mirrors
 *  RouteThumbnail.vue's own `@resize` handler, minus its `userMoved` guard, since that one is
 *  fully inert (no drag/zoom to protect). */
function handleResize() {
  if (userMoved) return;
  fit();
}

watch(() => props.points, render);

/** Called every replay frame — imperative on purpose, see module doc. */
function setMarkerPosition(lat: number, lon: number) {
  marker?.setLatLng([lat, lon]);
}

defineExpose({ setMarkerPosition, invalidateSize: () => map?.invalidateSize() });
</script>

<template>
  <div class="run-map">
    <LeafletMapBase class="map-surface" @ready="handleReady" @resize="handleResize" />
    <BasemapToggle class="basemap-toggle-slot" />
  </div>
</template>

<style scoped>
.run-map {
  position: relative;
  width: 100%;
  height: 100%;
  /* No min-height floor: both consumers (RouteOverviewPage.vue's flex:1 wrapper,
     RunReplay.vue's fixed-height .map-wrap) already establish real height — see
     RouteMapEditor.vue's matching comment for why a floor here would fight a short viewport
     instead of yielding to it. */
  min-height: 0;
  border-radius: var(--r-lg);
  background: var(--bg);
}
.basemap-toggle-slot {
  top: 12px;
  right: 12px;
}
.map-surface {
  width: 100%;
  height: 100%;
}
</style>
