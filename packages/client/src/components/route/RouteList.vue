<script setup lang="ts">
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { useConfirmTap } from "../../composables/useConfirmTap";
import type { PlannedRoute } from "../../services/plannedRouteService";

const emit = defineEmits<{ edit: [route: PlannedRoute]; start: [route: PlannedRoute] }>();

const plannedRouteStore = usePlannedRouteStore();
const deleteConfirm = useConfirmTap((id) => id && plannedRouteStore.remove(id));

function thumbnailPath(route: PlannedRoute): string {
  const pts = route.waypoints;
  if (pts.length < 2) return "";
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const spanLat = Math.max(...lats) - minLat || 1;
  const minLon = Math.min(...lons);
  const spanLon = Math.max(...lons) - minLon || 1;
  const coords = pts.map((p) => {
    const x = ((p.lon - minLon) / spanLon) * 100;
    const y = 100 - ((p.lat - minLat) / spanLat) * 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${coords.join(" L ")}`;
}
</script>

<template>
  <div v-if="plannedRouteStore.routes.length > 0" class="route-grid">
    <div v-for="route in plannedRouteStore.routes" :key="route.id" class="route-card surface-hybrid">
      <svg class="route-thumb" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path :d="thumbnailPath(route)" :class="{ approximate: route.geometrySource === 'straight' }" fill="none" />
      </svg>
      <div class="route-info">
        <b>{{ route.name }}</b>
        <span>
          {{ (route.distanceM / 1000).toFixed(2) }} km{{ route.geometrySource === "straight" ? " ≈" : "" }} ·
          {{ route.elevationGainM != null ? Math.round(route.elevationGainM) + " hm" : "Höhe unbekannt" }}
        </span>
      </div>
      <div class="route-actions">
        <button class="btn-secondary" @click="emit('start', route)">Starten</button>
        <button class="icon-btn" aria-label="Bearbeiten" @click="emit('edit', route)">✎</button>
        <button
          class="icon-btn danger"
          :class="{ confirming: deleteConfirm.isArmed(route.id) }"
          aria-label="Löschen"
          @click="deleteConfirm.trigger(route.id)"
        >
          {{ deleteConfirm.isArmed(route.id) ? "Wirklich?" : "🗑" }}
        </button>
      </div>
    </div>
  </div>
  <div v-else class="route-empty surface-hybrid">
    <div class="eyebrow">Noch keine Strecke</div>
    <p>Platziere Wegpunkte auf der Karte und speichere sie als wiederverwendbare Strecke.</p>
  </div>
</template>

<style scoped>
.route-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.route-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--r-lg);
}
.route-thumb {
  width: 100%;
  height: 80px;
}
.route-thumb path {
  stroke: var(--fire);
  stroke-width: 3;
}
.route-thumb path.approximate {
  stroke-dasharray: 4 4;
  opacity: 0.6;
}
.route-actions {
  display: flex;
  gap: 6px;
}
.icon-btn {
  min-width: 44px;
  min-height: 44px;
}
</style>
