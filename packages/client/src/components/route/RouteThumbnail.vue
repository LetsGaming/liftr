<script setup lang="ts">
/**
 * Small, fully inert map preview for a route card — real OSM tiles under the route line. Lazy:
 * doesn't create a Leaflet instance or fetch a tile until the card scrolls into view
 * (IntersectionObserver), and tears the map down on unmount, since this sits in a grid that
 * mounts/unmounts on every Verlauf/Strecken tab switch.
 *
 * Uses a ResizeObserver on the container rather than a one-shot `invalidateSize()` after mount:
 * the container's size can still be settling after mount (e.g. inside a sheet's open transition),
 * and a one-shot call can fire too early, leaving the map showing only a stale tile in one corner.
 * The ResizeObserver instead fires whenever the box's real size settles, whatever caused it.
 */
import L from "leaflet";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { cssVar, createOsmTileLayer } from "../../lib/leafletTheme";
import type { Waypoint } from "../../services/plannedRouteService";

const props = defineProps<{ points: Waypoint[]; approximate?: boolean }>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeRaf: number | null = null;

function createMap(el: HTMLDivElement) {
  map = L.map(el, {
    attributionControl: false,
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
  });
  createOsmTileLayer().addTo(map);

  const latLngs = props.points.map((p) => [p.lat, p.lon] as [number, number]);
  const line = L.polyline(latLngs, {
    color: cssVar("--fire", "#ff7a1f"),
    weight: 3,
    dashArray: props.approximate ? "4 4" : undefined,
  });
  line.addTo(map);
  map.fitBounds(line.getBounds(), { padding: [8, 8] });

  resizeObserver = new ResizeObserver(() => {
    if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      if (!map) return;
      map.invalidateSize();
      map.fitBounds(line.getBounds(), { padding: [8, 8] });
    });
  });
  resizeObserver.observe(el);
}

onMounted(() => {
  if (!container.value || props.points.length < 2) return;
  const el = container.value;
  intersectionObserver = new IntersectionObserver((entries) => {
    if (!entries[0]?.isIntersecting) return;
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    createMap(el);
  });
  intersectionObserver.observe(el);
});

onBeforeUnmount(() => {
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
  map?.remove();
  map = null;
});
</script>

<template>
  <div ref="container" class="route-thumb-map" aria-hidden="true" />
</template>

<style scoped>
.route-thumb-map {
  width: 100%;
  height: 88px;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-2);
}
.route-thumb-map :deep(.leaflet-container) {
  background: var(--surface-2);
}
</style>
