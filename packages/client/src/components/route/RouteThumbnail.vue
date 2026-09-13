<script setup lang="ts">
/**
 * Small, fully inert map preview for a route card — real OSM tiles under the route line, via
 * LeafletMapBase (owns lazy-mount, tile layer, and resize handling). This sits in a grid that
 * mounts/unmounts on every Verlauf/Strecken tab switch, so LeafletMapBase's lazy prop matters
 * here: no Leaflet instance or tile fetch until the card actually scrolls into view.
 */
import L from "leaflet";
import LeafletMapBase from "../map/LeafletMapBase.vue";
import { cssVar } from "../../lib/leafletTheme";
import type { Waypoint } from "../../services/plannedRouteService";

const props = defineProps<{ points: Waypoint[]; approximate?: boolean }>();

const inertMapOptions: Partial<L.MapOptions> = {
  attributionControl: false,
  zoomControl: false,
  dragging: false,
  touchZoom: false,
  doubleClickZoom: false,
  scrollWheelZoom: false,
  boxZoom: false,
  keyboard: false,
};

let map: L.Map | null = null;
let line: L.Polyline | null = null;

function render() {
  if (!map || props.points.length < 2) return;
  const latLngs = props.points.map((p) => [p.lat, p.lon] as [number, number]);
  line = L.polyline(latLngs, {
    color: cssVar("--fire", "#ff7a1f"),
    weight: 3,
    dashArray: props.approximate ? "4 4" : undefined,
  });
  line.addTo(map);
  map.fitBounds(line.getBounds(), { padding: [8, 8] });
}

function handleReady(m: L.Map) {
  map = m;
  render();
}

// LeafletMapBase's ResizeObserver already calls invalidateSize() on resize; refitting to the
// route's own bounds here undoes the stale center/zoom invalidateSize() alone would leave behind.
function handleResize() {
  if (!map || !line) return;
  map.fitBounds(line.getBounds(), { padding: [8, 8] });
}
</script>

<template>
  <div class="route-thumb-map" aria-hidden="true">
    <LeafletMapBase
      v-if="points.length >= 2"
      class="map-surface"
      lazy
      :map-options="inertMapOptions"
      @ready="handleReady"
      @resize="handleResize"
    />
  </div>
</template>

<style scoped>
.route-thumb-map {
  width: 100%;
  height: 88px;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-2);
}
.map-surface {
  width: 100%;
  height: 100%;
}
.route-thumb-map :deep(.leaflet-container) {
  background: var(--surface-2);
}
</style>
