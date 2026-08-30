<script setup lang="ts">
/**
 * Route map (plan Phase 4.2): Leaflet + public OSM tiles. Single-user, low-volume interactive
 * viewing is within OSM's tile usage policy (audit §4) — no bulk prefetch, attribution shown.
 * Also hosts the replay marker (plan 4.3): `setMarkerPosition` is called every animation frame
 * by RunReplay.vue, kept as an imperative method rather than a reactive prop so replay doesn't
 * pay Vue's reactivity/diffing cost on every frame.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { RunPoint } from "../../stores/runsStore";

const props = defineProps<{ points: RunPoint[] }>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.CircleMarker | null = null;
/** Tracked separately (not stashed as an untyped property on `map`) so `render()` can clear
 *  everything *except* the base tile layer on every points update without an `any` cast. */
let osmLayer: L.TileLayer | null = null;

function render() {
  if (!map || props.points.length === 0) return;
  map.eachLayer((layer) => {
    if (layer !== osmLayer) map!.removeLayer(layer);
  });

  const latLngs = props.points.map((p) => [p.lat, p.lon] as [number, number]);
  const line = L.polyline(latLngs, { color: "#ff7a1f", weight: 4, opacity: 0.9 });
  line.addTo(map);
  map.fitBounds(line.getBounds(), { padding: [24, 24] });

  L.circleMarker(latLngs[0]!, { radius: 6, color: "#0e1826", weight: 2, fillColor: "#37d67a", fillOpacity: 1 }).addTo(map);
  L.circleMarker(latLngs[latLngs.length - 1]!, { radius: 6, color: "#0e1826", weight: 2, fillColor: "#ff4757", fillOpacity: 1 }).addTo(map);

  marker = L.circleMarker(latLngs[0]!, { radius: 7, color: "#fff", weight: 2, fillColor: "#5ba0ff", fillOpacity: 1 });
  marker.addTo(map);
}

onMounted(() => {
  if (!container.value) return;
  map = L.map(container.value, { attributionControl: true, zoomControl: true });
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  });
  osm.addTo(map);
  osmLayer = osm;
  render();
});

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

watch(() => props.points, render);

/** Called every replay frame — imperative on purpose, see module doc. */
function setMarkerPosition(lat: number, lon: number) {
  marker?.setLatLng([lat, lon]);
}

defineExpose({ setMarkerPosition });
</script>

<template>
  <div ref="container" class="run-map" />
</template>

<style scoped>
.run-map {
  width: 100%;
  height: 100%;
  min-height: 260px;
  border-radius: var(--r-lg);
  background: #0e1826;
}
</style>
