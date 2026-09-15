<script setup lang="ts">
/**
 * Single place that creates a Leaflet map instance, attaches the OSM tile layer, and keeps it
 * correctly sized. Every map component (RunMap, RouteMapEditor, RouteThumbnail) mounts this and
 * adds its own layers/markers/handlers in response to `ready` — this component owns only the
 * lifecycle, not any domain rendering.
 *
 * The resize handling is the actual bug fix this consolidation buys: a `ResizeObserver` that
 * calls `invalidateSize()` for the component's entire lifetime, not a one-shot
 * `requestAnimationFrame` after mount. Leaflet measures its container once at creation and caches
 * that size; if the container is still animating into its final size at that point (e.g. a sheet
 * modal's open transition), a one-shot invalidate fired too early leaves the map painting only a
 * stale tile island in one corner — reproduced in `RouteMapEditor.vue` before this component
 * existed. A live `ResizeObserver` has no such timing dependency: it fires whenever the box's real
 * size settles, whatever caused that, for as long as the map is mounted.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createLabelsTileLayer, createTileLayer, type BasemapId } from "../../lib/leafletTheme";
import { useBasemap } from "../../composables/useBasemap";

const props = defineProps<{
  mapOptions?: Partial<L.MapOptions>;
  initialView?: { center: [number, number]; zoom: number };
  lazy?: boolean;
  /** Pins the tile layer to this basemap, ignoring the shared standard/satellite preference —
   *  RouteThumbnail.vue passes "standard" so a small inert route-card preview stays consistent
   *  regardless of what the user last picked on a real map. Omit to follow the shared preference
   *  (useBasemap.ts) like every interactive map does. */
  basemap?: BasemapId;
}>();

const emit = defineEmits<{ ready: [map: L.Map]; resize: [] }>();

const { basemap: sharedBasemap } = useBasemap();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let tileLayer: L.TileLayer | null = null;
// Only ever present alongside the satellite base layer — see createLabelsTileLayer's doc for why
// this is a second stacked layer rather than something baked into the base tile URL.
let labelsLayer: L.TileLayer | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeRaf: number | null = null;

function createMap(el: HTMLDivElement) {
  map = L.map(el, { attributionControl: true, zoomControl: true, ...props.mapOptions });
  const resolved = props.basemap ?? sharedBasemap.value;
  tileLayer = createTileLayer(resolved);
  tileLayer.addTo(map);
  if (resolved === "satellite") {
    labelsLayer = createLabelsTileLayer();
    labelsLayer.addTo(map);
  }
  if (props.initialView) map.setView(props.initialView.center, props.initialView.zoom);

  resizeObserver = new ResizeObserver(() => {
    if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      map?.invalidateSize();
      emit("resize");
    });
  });
  resizeObserver.observe(el);

  emit("ready", map);
}

// Only reacts to the shared preference when `basemap` isn't pinning this map to one — see the
// prop doc above. The getter short-circuits past `sharedBasemap.value` entirely while pinned, so
// Vue never even tracks it as a dependency and this watcher simply never fires in that case.
watch(
  () => (props.basemap ? null : sharedBasemap.value),
  (next) => {
    if (!next || !map) return;
    // Add the new layer before removing the old one, so there's never a frame with no tiles at
    // all underneath whatever's currently drawn on top (route line, markers). Same add-then-
    // remove ordering applies to the labels layer, which only exists alongside satellite.
    const nextLayer = createTileLayer(next);
    nextLayer.addTo(map);
    tileLayer?.remove();
    tileLayer = nextLayer;

    const nextLabels = next === "satellite" ? createLabelsTileLayer() : null;
    nextLabels?.addTo(map);
    labelsLayer?.remove();
    labelsLayer = nextLabels;
  },
);

onMounted(() => {
  if (!container.value) return;
  const el = container.value;
  if (props.lazy) {
    intersectionObserver = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      createMap(el);
    });
    intersectionObserver.observe(el);
  } else {
    createMap(el);
  }
});

onBeforeUnmount(() => {
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
  map?.remove();
  map = null;
  tileLayer = null;
  labelsLayer = null;
});

defineExpose({
  getMap: () => map,
  invalidateSize: () => map?.invalidateSize(),
});
</script>

<template>
  <div ref="container" class="leaflet-map-base" />
</template>

<style scoped>
.leaflet-map-base {
  width: 100%;
  height: 100%;
}
</style>
