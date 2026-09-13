<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "../ui/AppIcon.vue";
import RouteThumbnail from "./RouteThumbnail.vue";
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { useConfirmTap } from "../../composables/useConfirmTap";
import type { PlannedRoute } from "../../services/plannedRouteService";

const emit = defineEmits<{ edit: [route: PlannedRoute]; start: [route: PlannedRoute]; create: [] }>();

const plannedRouteStore = usePlannedRouteStore();
const deleteConfirm = useConfirmTap((id) => id && plannedRouteStore.remove(id));
const router = useRouter();

/** Opens the route's detail screen — mirrors RoutineList.vue's openOverview() drill-in pattern. */
function openOverview(routeId: string) {
  void router.push(`/routes/${routeId}`);
}

// Per-card ⋮ menu (Starten + Bearbeiten/Löschen). Replaces a 3-button row (Starten + two raw-emoji
// icon buttons) that overflowed a narrow 2-column grid. Same pattern as RoutineList.vue's
// .rc-menu-wrap/.rc-menu, hand-rolled locally rather than pulling in useRoutineManagement — that
// composable also bundles builder-modal state this component doesn't have.
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
    <div
      v-for="route in plannedRouteStore.routes"
      :key="route.id"
      class="route-card surface-hybrid"
      role="button"
      tabindex="0"
      @click="openOverview(route.id)"
      @keydown.enter="openOverview(route.id)"
    >
      <RouteThumbnail :points="route.polyline" :approximate="route.geometrySource === 'straight'" />
      <div class="route-head">
        <div class="route-info">
          <b>{{ route.name }}</b>
          <span>
            {{ (route.distanceM / 1000).toFixed(2) }} km{{ route.geometrySource === "straight" ? " ≈" : "" }} ·
            {{ route.elevationGainM != null ? Math.round(route.elevationGainM) + " hm" : "Höhe unbekannt" }}
          </span>
        </div>
        <!-- @click.stop so opening/using the menu doesn't also fire the card's own navigate tap. -->
        <div class="menu-wrap" @click.stop>
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
      <div class="route-actions" @click.stop>
        <button class="btn-secondary" @click="emit('start', route)">Starten</button>
      </div>
    </div>
  </div>
  <!-- Every RouteThumbnail runs with attributionControl:false (no room in an 88px card); this
       single credit line keeps the grid compliant with OSM's tile usage policy. -->
  <p v-if="plannedRouteStore.routes.length > 0" class="map-credit">Karten © OpenStreetMap contributors</p>
  <div v-else class="route-empty surface-hybrid">
    <div class="eyebrow">Noch keine Strecke</div>
    <p>Platziere Wegpunkte auf der Karte und speichere sie als wiederverwendbare Strecke.</p>
    <button class="btn-primary" @click="emit('create')">+ Neue Strecke</button>
  </div>
  <!-- The empty-state CTA above only renders while the list is empty (RoutineList.vue has the
       same shape) — without this, there was no way at all to create a second route once one
       already existed. -->
  <button v-if="plannedRouteStore.routes.length > 0" class="btn-secondary route-list-add" @click="emit('create')">+ Neue Strecke</button>
</template>

<style scoped>
/* Grid sizing/gap/max-width mirrors RoutineList.vue's .routine-grid exactly (Workout tab's
   equivalent card grid) — the two lists were sized independently and drifted apart, which read
   as Läufe and Workout not being the same app. */
.route-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sp3);
  width: 100%;
  max-width: var(--content-w-wide);
}
@media (min-width: 900px) {
  .route-grid {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--sp5);
    max-width: var(--content-w-xwide);
  }
}
.route-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  padding: var(--sp4);
  border-radius: var(--r-lg);
  /* min-width:0 lets the flex column shrink instead of the card growing past its grid track,
     so .route-info's overflow-wrap can kick in. Deliberately NOT overflow:hidden — the ⋮
     dropdown below needs to escape the card's own bounds. */
  min-width: 0;
  /* Same entrance stagger + hover lift as .routine-card (RoutineList.vue) — Workout's cards
     animate in and lift on hover; Läufe's didn't, which was part of the same "different app"
     mismatch as the grid sizing above. */
  animation: pop-in var(--dur-base) var(--ease-out) backwards;
  transition: box-shadow var(--dur-base) var(--ease-out);
}
.route-grid > .route-card:nth-child(1) {
  animation-delay: 0ms;
}
.route-grid > .route-card:nth-child(2) {
  animation-delay: 40ms;
}
.route-grid > .route-card:nth-child(3) {
  animation-delay: 80ms;
}
.route-grid > .route-card:nth-child(n + 4) {
  animation-delay: 120ms;
}
@media (hover: hover) {
  .route-card:hover {
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.6);
  }
}
@media (min-width: 900px) {
  .route-card {
    padding: var(--sp6);
    gap: var(--sp3);
    border-radius: var(--r-xl);
  }
  .route-info b {
    font-size: 18px;
  }
}
/* Outer radius minus this card's own padding, so the thumbnail nests snugly instead of using its
   default (--r-md, 16px) — recomputed for each breakpoint's own radius/padding pair above. */
.route-card :deep(.route-thumb-map) {
  border-radius: 6px;
}
@media (min-width: 900px) {
  .route-card :deep(.route-thumb-map) {
    border-radius: 4px;
  }
}
.map-credit {
  margin-top: var(--sp2);
  color: var(--faint);
  font-size: 11px;
}
.route-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp2);
}
.route-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.route-info b {
  /* Matches RoutineList.vue's .rc-head b (15.5px / 18px desktop) — was unset before (inheriting
     the page's default body size), one more point of size drift from Workout's routine cards. */
  font-size: 15.5px;
  overflow-wrap: anywhere;
}
.route-info span {
  font-size: 12px;
  color: var(--dim);
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
  color: var(--danger);
}
.route-menu button.danger.confirming {
  background: var(--danger-lo);
  color: var(--text);
  font-weight: 700;
}
.route-list-add {
  margin-top: var(--sp3);
}
.route-empty p {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
  margin-bottom: var(--sp3);
}
</style>
