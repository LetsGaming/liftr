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
import { onBeforeUnmount, onMounted, ref } from "vue";
import { createOsmTileLayer } from "../../lib/leafletTheme";

const props = defineProps<{
  mapOptions?: Partial<L.MapOptions>;
  initialView?: { center: [number, number]; zoom: number };
  lazy?: boolean;
}>();

const emit = defineEmits<{ ready: [map: L.Map]; resize: [] }>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeRaf: number | null = null;

function createMap(el: HTMLDivElement) {
  map = L.map(el, { attributionControl: true, zoomControl: true, ...props.mapOptions });
  createOsmTileLayer().addTo(map);
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
