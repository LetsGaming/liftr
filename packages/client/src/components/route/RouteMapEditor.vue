<script setup lang="ts">
/**
 * Tap-to-place / drag-to-reposition waypoint editor. Sibling to RunMap.vue rather than a
 * variant of it — RunMap is view-only, this component's whole job is click/drag interaction.
 */
import L from "leaflet";
import { onBeforeUnmount, watch } from "vue";
import { cssVar } from "../../lib/leafletTheme";
import LeafletMapBase from "../map/LeafletMapBase.vue";
import BasemapToggle from "../map/BasemapToggle.vue";
import { useConfirmTap } from "../../composables/useConfirmTap";
import { useLastKnownLocation } from "../../composables/useLastKnownLocation";
import type { RoutePoint, Waypoint } from "../../services/plannedRouteService";

const props = defineProps<{
  waypoints: Waypoint[];
  routedPoints: RoutePoint[];
  approximate?: boolean;
  /** Draws the fallback line's closing segment back to waypoints[0] — used for a closed loop when
   *  there's no real routedPoints geometry yet (RouteWizard.vue's synthetic closing point is
   *  deliberately not in `waypoints`, since those are only the user's editable markers, so without
   *  this the local line of a closed loop stops one segment short). Ignored once routedPoints is
   *  non-empty — real geometry already closes itself. Markers are unaffected either way. */
  closed?: boolean;
  initialCenter?: { lat: number; lon: number };
  readonly?: boolean;
}>();

const emit = defineEmits<{
  add: [waypoint: Waypoint];
  move: [index: number, waypoint: Waypoint];
  remove: [index: number];
}>();

let map: L.Map | null = null;
let markers: L.Marker[] = [];
let line: L.Polyline | null = null;

const removeConfirm = useConfirmTap((key) => emit("remove", Number(key)));

function renderMarkers() {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers = props.waypoints.map((w, i) => {
    const confirming = removeConfirm.isArmed(String(i));
    // "generated" (the loop-close arc, see RouteWizard.vue's setCloseLoop) gets an outlined
    // rather than filled badge — still an ordinary draggable/removable marker, just visibly
    // distinct so it's obvious at a glance which points the app placed vs. the user.
    const classes = [confirming ? "confirming" : "", w.gen ? "generated" : ""].filter(Boolean).join(" ");
    const icon = L.divIcon({
      className: "route-waypoint-icon",
      html: `<span class="${classes}">${confirming ? "×" : i + 1}</span>`,
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
      : (() => {
          const local = props.waypoints.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: null }));
          // Real geometry (routedPoints) already closes itself server-side — this only patches
          // the local fallback line, which draws through the raw editable waypoints and would
          // otherwise stop one segment short of the actual closing point.
          return props.closed && props.waypoints.length >= 2
            ? [...local, { ...local[0]!, idx: local.length }]
            : local;
        })();
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

// Remembers the last geolocation fix (from the 📍 button below) so the map opens centered near
// the user next time instead of the hardcoded Berlin fallback, even offline or before a fresh
// fix resolves.
const { getStoredLocation, locate: locateAndStore } = useLastKnownLocation();

function locate() {
  locateAndStore((coords) => map?.setView([coords.lat, coords.lon], 15));
}

const initialCenter = props.waypoints[0] ?? props.initialCenter ?? getStoredLocation() ?? { lat: 52.52, lon: 13.405 };

function handleReady(m: L.Map) {
  map = m;
  map.on("click", (e: L.LeafletMouseEvent) => {
    if (props.readonly) return;
    emit("add", { lat: e.latlng.lat, lon: e.latlng.lng });
  });
  renderMarkers();
  renderLine();
}

onBeforeUnmount(() => {
  map = null;
});

watch(() => props.waypoints, () => { renderMarkers(); renderLine(); }, { deep: true });
watch(() => [props.routedPoints, props.approximate, props.closed], renderLine, { deep: true });
watch(removeConfirm.armedKey, renderMarkers);

defineExpose({ invalidateSize: () => map?.invalidateSize() });
</script>

<template>
  <div class="route-map-editor">
    <LeafletMapBase
      class="map-surface"
      :initial-view="{ center: [initialCenter.lat, initialCenter.lon], zoom: 14 }"
      @ready="handleReady"
    />
    <BasemapToggle class="basemap-toggle-slot" />
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
  /* No min-height floor: this only ever sits inside RouteWizard.vue's `.wizard-map` (flex: 1;
     min-height: 0, itself inside SheetModal's `fill-body` flex column), which already guarantees
     real height. A floor here fights that flex sizing on a short viewport — a taller floor than
     the available space is exactly what forced the wizard's page to scroll before fill-body
     existed (see RouteWizard.vue's header comment and SheetModal.vue's fillBody prop doc). */
  min-height: 0;
}
.map-surface {
  width: 100%;
  height: 100%;
  border-radius: var(--r-lg);
  background: var(--bg);
}
/* Stacks below .basemap-toggle-slot (top:12px) rather than sharing its row — top-left is
   Leaflet's own zoom control, bottom-right its attribution, so top-right is the only free corner
   for both of this component's own floating buttons. */
.basemap-toggle-slot {
  top: 12px;
  right: 12px;
}
.locate-btn {
  position: absolute;
  top: 64px;
  right: 12px;
  z-index: 1000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--line);
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
  border: 1px solid var(--line);
  /* No global button-text-color reset exists, so without this the browser's default button text
     color (near-black) was used unconditionally — fine against light mode's white --surface, but
     unreadable against dark mode's near-black one. */
  color: var(--text);
}

/* Waypoint marker badge: L.divIcon's `className` REPLACES Leaflet's default class rather than
   adding to it, so this component owns the full visual (no leaflet.css box/border styling).
   Leaflet also sets inline width/height on the outer div from `iconSize` (28px, sized for map
   density, not touch target), so the 44px touch target lives on the inner <span> instead —
   centering it in the larger, unclipped flex box keeps it anchored on the same map coordinate
   while presenting a full 44px hit area. `:deep()` is needed because Leaflet injects this markup
   via innerHTML, outside Vue's scoped-CSS render tree. */
:deep(.route-waypoint-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
}
:deep(.route-waypoint-icon span) {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  background: var(--warning);
  color: var(--k-warmup-text);
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
}
/* Armed-to-delete state, added by renderMarkers() while removeConfirm has this waypoint armed —
   mirrors WorkoutPage.vue's .cancel-btn.confirming treatment for the same pattern elsewhere. */
:deep(.route-waypoint-icon span.confirming) {
  background: var(--danger-lo);
  border-color: var(--danger);
  color: var(--text);
}
/* Generated loop-close point (RouteWizard.vue's setCloseLoop) — outlined instead of filled so
   it's visibly distinct from a user-placed waypoint at a glance, while staying just as draggable
   and removable. Confirming-to-delete still wins over this if both apply. */
:deep(.route-waypoint-icon span.generated) {
  background: transparent;
  border: 2px dashed var(--warning);
  color: var(--warning);
}
:deep(.route-waypoint-icon span.generated.confirming) {
  background: var(--danger-lo);
  border: 2px dashed var(--danger);
  color: var(--text);
}
</style>
