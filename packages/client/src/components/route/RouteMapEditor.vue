<script setup lang="ts">
/**
 * Tap-to-place / drag-to-reposition waypoint editor. A new sibling to RunMap.vue (not an
 * extension of it) — RunMap is view-only and hosts a deliberately-imperative replay fast-path;
 * this component's whole job is click/drag interaction, a genuinely different concern.
 */
import L from "leaflet";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cssVar, createOsmTileLayer } from "../../lib/leafletTheme";
import { useConfirmTap } from "../../composables/useConfirmTap";
import type { RoutePoint, Waypoint } from "../../services/plannedRouteService";

const props = defineProps<{
  waypoints: Waypoint[];
  routedPoints: RoutePoint[];
  approximate?: boolean;
  initialCenter?: { lat: number; lon: number };
  readonly?: boolean;
}>();

const emit = defineEmits<{
  add: [waypoint: Waypoint];
  move: [index: number, waypoint: Waypoint];
  remove: [index: number];
}>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let markers: L.Marker[] = [];
let line: L.Polyline | null = null;

const removeConfirm = useConfirmTap((key) => emit("remove", Number(key)));

function renderMarkers() {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers = props.waypoints.map((w, i) => {
    const confirming = removeConfirm.isArmed(String(i));
    const icon = L.divIcon({
      className: "route-waypoint-icon",
      html: `<span class="${confirming ? "confirming" : ""}">${confirming ? "×" : i + 1}</span>`,
      iconSize: [28, 28],
    });
    const marker = L.marker([w.lat, w.lon], { draggable: !props.readonly, icon });
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      emit("move", i, { lat: pos.lat, lon: pos.lng });
    });
    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (props.readonly) return;
      removeConfirm.trigger(String(i));
    });
    marker.addTo(map!);
    return marker;
  });
}

function renderLine() {
  if (!map) return;
  line?.remove();
  const source =
    props.routedPoints.length > 0
      ? props.routedPoints
      : props.waypoints.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: null }));
  if (source.length < 2) return;
  line = L.polyline(
    source.map((p) => [p.lat, p.lon] as [number, number]),
    {
      color: cssVar("--fire", "#ff7a1f"),
      weight: 4,
      opacity: props.approximate ? 0.6 : 0.9,
      dashArray: props.approximate ? "6 8" : undefined,
    },
  );
  line.addTo(map);
}

function locate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => map?.setView([pos.coords.latitude, pos.coords.longitude], 15),
    () => {}, // denied/unavailable — the parent's initialCenter fallback already covers this
    { enableHighAccuracy: false, timeout: 5000 },
  );
}

onMounted(() => {
  if (!container.value) return;
  const center = props.waypoints[0] ?? props.initialCenter ?? { lat: 52.52, lon: 13.405 };
  map = L.map(container.value, { attributionControl: true, zoomControl: true }).setView([center.lat, center.lon], 14);
  createOsmTileLayer().addTo(map);
  map.on("click", (e: L.LeafletMouseEvent) => {
    if (props.readonly) return;
    emit("add", { lat: e.latlng.lat, lon: e.latlng.lng });
  });
  requestAnimationFrame(() => map?.invalidateSize());
  renderMarkers();
  renderLine();
});

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

watch(() => props.waypoints, () => { renderMarkers(); renderLine(); }, { deep: true });
watch(() => [props.routedPoints, props.approximate], renderLine, { deep: true });
watch(removeConfirm.armedKey, renderMarkers);

defineExpose({ invalidateSize: () => map?.invalidateSize() });
</script>

<template>
  <div class="route-map-editor">
    <div ref="container" class="map-surface" />
    <button v-if="!readonly" type="button" class="locate-btn" aria-label="Meinen Standort verwenden" @click="locate">
      📍
    </button>
    <button
      v-if="!readonly && waypoints.length > 0"
      type="button"
      class="remove-last-btn"
      @click="emit('remove', waypoints.length - 1)"
    >
      Letzten Punkt entfernen
    </button>
  </div>
</template>

<style scoped>
.route-map-editor {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
}
.map-surface {
  width: 100%;
  height: 100%;
  border-radius: var(--r-lg);
  background: var(--bg);
}
.locate-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 20px;
}
.remove-last-btn {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 1000;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--border);
}
</style>
