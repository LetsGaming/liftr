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

/** Leaflet draws to its own canvas/SVG layer, outside the page's CSS cascade — `var(--fire)`
 *  can't be written directly into a Leaflet color option the way it can into a stylesheet.
 *  Reading the resolved custom property off :root at draw time (critique finding: this file
 *  re-hardcoded 5 hexes that already exist as tokens.css tokens, one of which — #0e1826 — matched
 *  no token at all, so the map couldn't follow any future palette change) keeps this file on the
 *  same palette as everything else without needing a build-time color pipeline. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function render() {
  if (!map || props.points.length === 0) return;
  map.eachLayer((layer) => {
    if (layer !== osmLayer) map!.removeLayer(layer);
  });

  const latLngs = props.points.map((p) => [p.lat, p.lon] as [number, number]);
  const line = L.polyline(latLngs, { color: cssVar("--fire", "#ff7a1f"), weight: 4, opacity: 0.9 });
  line.addTo(map);
  map.fitBounds(line.getBounds(), { padding: [24, 24] });

  const ringColor = cssVar("--bg", "#0a0c14");
  L.circleMarker(latLngs[0]!, { radius: 6, color: ringColor, weight: 2, fillColor: cssVar("--green", "#37d67a"), fillOpacity: 1 }).addTo(map);
  L.circleMarker(latLngs[latLngs.length - 1]!, { radius: 6, color: ringColor, weight: 2, fillColor: cssVar("--red", "#ff4757"), fillOpacity: 1 }).addTo(map);

  marker = L.circleMarker(latLngs[0]!, { radius: 7, color: "#fff", weight: 2, fillColor: cssVar("--blue-hi", "#5ba0ff"), fillOpacity: 1 });
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
  background: var(--bg);
}
</style>
