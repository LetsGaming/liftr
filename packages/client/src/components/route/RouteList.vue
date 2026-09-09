<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import AppIcon from "../ui/AppIcon.vue";
import RouteThumbnail from "./RouteThumbnail.vue";
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { useConfirmTap } from "../../composables/useConfirmTap";
import type { PlannedRoute } from "../../services/plannedRouteService";

const emit = defineEmits<{ edit: [route: PlannedRoute]; start: [route: PlannedRoute]; create: [] }>();

const plannedRouteStore = usePlannedRouteStore();
const deleteConfirm = useConfirmTap((id) => id && plannedRouteStore.remove(id));

// Per-card ⋮ menu (Starten + Bearbeiten/Löschen), replacing the old 3-button row (Starten +
// two raw-emoji icon buttons) that overflowed the card on a narrow 2-column grid (critique
// finding: at 390px the row needed ~184px but only ~153px was available, spilling the delete
// button outside the card and flush against the viewport edge). Same pattern as
// RoutineList.vue's .rc-menu-wrap/.rc-menu, hand-rolled locally rather than pulling in
// useRoutineManagement — that composable also bundles builder-modal state this component
// doesn't have.
const openMenuId = ref<string | null>(null);
function toggleMenu(routeId: string) {
  openMenuId.value = openMenuId.value === routeId ? null : routeId;
}
function onDocumentClick(event: MouseEvent) {
  if (openMenuId.value === null) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".menu-wrap")) return;
  openMenuId.value = null;
}
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && openMenuId.value !== null) openMenuId.value = null;
}
document.addEventListener("click", onDocumentClick);
document.addEventListener("keydown", onDocumentKeydown);
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
});

function editFromMenu(route: PlannedRoute) {
  openMenuId.value = null;
  emit("edit", route);
}
</script>

<template>
  <div v-if="plannedRouteStore.routes.length > 0" class="route-grid">
    <div v-for="route in plannedRouteStore.routes" :key="route.id" class="route-card surface-hybrid">
      <RouteThumbnail :points="route.polyline" :approximate="route.geometrySource === 'straight'" />
      <div class="route-info">
        <b>{{ route.name }}</b>
        <span>
          {{ (route.distanceM / 1000).toFixed(2) }} km{{ route.geometrySource === "straight" ? " ≈" : "" }} ·
          {{ route.elevationGainM != null ? Math.round(route.elevationGainM) + " hm" : "Höhe unbekannt" }}
        </span>
      </div>
      <div class="route-actions">
        <button class="btn-secondary" @click="emit('start', route)">Starten</button>
        <div class="menu-wrap">
          <button
            class="btn-icon"
            aria-label="Mehr"
            :aria-expanded="openMenuId === route.id"
            @click="toggleMenu(route.id)"
          >
            <AppIcon name="more" />
          </button>
          <div v-if="openMenuId === route.id" class="route-menu">
            <button @click="editFromMenu(route)"><AppIcon name="edit" /> Bearbeiten</button>
            <button
              class="danger"
              :class="{ confirming: deleteConfirm.isArmed(route.id) }"
              @click="deleteConfirm.trigger(route.id)"
            >
              <template v-if="deleteConfirm.isArmed(route.id)">Wirklich löschen?</template>
              <template v-else><AppIcon name="trash" /> Löschen</template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Every RouteThumbnail runs with attributionControl:false (a real Leaflet attribution corner
       doesn't fit an 88px-tall card) — this single credit line is what keeps the whole grid
       compliant with OSM's tile usage policy instead of dropping attribution silently. -->
  <p v-if="plannedRouteStore.routes.length > 0" class="map-credit">Karten © OpenStreetMap contributors</p>
  <div v-else class="route-empty surface-hybrid">
    <div class="eyebrow">Noch keine Strecke</div>
    <p>Platziere Wegpunkte auf der Karte und speichere sie als wiederverwendbare Strecke.</p>
    <button class="btn-primary" @click="emit('create')">+ Neue Strecke</button>
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
  /* Long route names in a ~173px grid track had no wrap/ellipsis path before (critique
     finding); min-width:0 lets the flex column actually shrink instead of the card growing
     past its grid track, and .route-info's own overflow-wrap picks up from there. Deliberately
     NOT overflow:hidden here — the ⋮ dropdown below needs to escape the card's own bounds. */
  min-width: 0;
}
.map-credit {
  margin-top: var(--sp2);
  color: var(--faint);
  font-size: 11px;
}
.route-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.route-info b {
  overflow-wrap: anywhere;
}
.route-actions {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.route-actions .btn-secondary {
  flex: 1;
  min-width: 0;
}
.menu-wrap {
  position: relative;
  flex: none;
}
.route-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.route-menu button {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  padding: 10px 14px;
  text-align: left;
  font-size: 13px;
  color: var(--text);
  background: none;
  border: none;
}
.route-menu button:hover {
  background: var(--surface-2);
}
.route-menu button.danger {
  color: var(--red);
}
.route-menu button.danger.confirming {
  background: var(--red-lo);
  color: var(--text);
  font-weight: 700;
}
.route-empty p {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
  margin-bottom: var(--sp3);
}
</style>
