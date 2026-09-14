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
  map.fitBounds(line.getBounds(), { padding: [24, 24] });

  const ringColor = cssVar("--bg", "#0a0c14");
  startMarker = L.circleMarker(latLngs[0]!, { radius: 6, color: ringColor, weight: 2, fillColor: cssVar("--green", "#37d67a"), fillOpacity: 1 }).addTo(map);
  endMarker = L.circleMarker(latLngs[latLngs.length - 1]!, { radius: 6, color: ringColor, weight: 2, fillColor: cssVar("--red", "#ff4757"), fillOpacity: 1 }).addTo(map);

  marker = L.circleMarker(latLngs[0]!, { radius: 7, color: "#fff", weight: 2, fillColor: cssVar("--blue-hi", "#5ba0ff"), fillOpacity: 1 });
  marker.addTo(map);
}

function handleReady(m: L.Map) {
  map = m;
  render();
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
    <LeafletMapBase class="map-surface" @ready="handleReady" />
  </div>
</template>

<style scoped>
.run-map {
  width: 100%;
  height: 100%;
  min-height: 260px;
  border-radius: var(--r-lg);
  background: var(--bg);
}
.map-surface {
  width: 100%;
  height: 100%;
}
</style>
