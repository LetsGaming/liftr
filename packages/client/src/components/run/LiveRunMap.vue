<script setup lang="ts">
/**
 * Read-only map for an in-progress live run: draws the growing GPS trace and a marker at the
 * current position, auto-panning to follow it. A new sibling to RouteMapEditor.vue (waypoint
 * editing) and RunMap.vue (finished-run replay, with its own imperative fast path) rather than a
 * reuse of either — this one's whole job is "append one point and keep the view centered on it",
 * a genuinely different, much simpler concern than either.
 */
import L from "leaflet";
import { watch } from "vue";
import LeafletMapBase from "../map/LeafletMapBase.vue";
import BasemapToggle from "../map/BasemapToggle.vue";
import { cssVar } from "../../lib/leafletTheme";

const props = defineProps<{
  points: { lat: number; lon: number }[];
  initialCenter?: { lat: number; lon: number };
}>();

let map: L.Map | null = null;
let line: L.Polyline | null = null;
let marker: L.Marker | null = null;

const dotIcon = L.divIcon({ className: "live-run-dot", html: "", iconSize: [16, 16] });

function render() {
  if (!map) return;
  if (props.points.length === 0) return;

  const latLngs = props.points.map((p) => [p.lat, p.lon] as [number, number]);

  if (!line) {
    line = L.polyline(latLngs, { color: cssVar("--fire", "#ff7a1f"), weight: 5, opacity: 0.9 }).addTo(map);
  } else {
    line.setLatLngs(latLngs);
  }

  const last = latLngs[latLngs.length - 1]!;
  if (!marker) {
    marker = L.marker(last, { icon: dotIcon }).addTo(map);
  } else {
    marker.setLatLng(last);
  }
  map.panTo(last, { animate: true });
}

function handleReady(m: L.Map) {
  map = m;
  render();
}

watch(() => props.points, render, { deep: true });

defineExpose({ invalidateSize: () => map?.invalidateSize() });
</script>

<template>
  <div class="live-run-map">
    <LeafletMapBase
      class="map-surface"
      :initial-view="{ center: [initialCenter?.lat ?? points[0]?.lat ?? 52.52, initialCenter?.lon ?? points[0]?.lon ?? 13.405], zoom: 16 }"
      @ready="handleReady"
    />
    <BasemapToggle class="basemap-toggle-slot" />
  </div>
</template>

<style scoped>
.live-run-map {
  position: relative;
  width: 100%;
  height: 100%;
  /* No min-height floor: sits inside LiveRunScreen.vue's `.live-map` (flex: 1; min-height: 0,
     itself inside SheetModal's `fill-body` flex column), which already guarantees real height —
     see RouteMapEditor.vue's matching comment for why a floor here would fight that instead. */
  min-height: 0;
  overflow: hidden;
}
.map-surface {
  width: 100%;
  height: 100%;
  border-radius: var(--r-lg);
  background: var(--bg);
}
.basemap-toggle-slot {
  top: 12px;
  right: 12px;
}
:global(.live-run-dot) {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--fire, #ff7a1f);
  border: 2px solid #fff;
  box-shadow: 0 0 0 3px rgba(255, 122, 31, 0.35);
}
</style>
