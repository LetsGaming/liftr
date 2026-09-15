<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import AppIcon from "../ui/AppIcon.vue";
import CardGrid from "../ui/CardGrid.vue";
import CardListScreen from "../ui/CardListScreen.vue";
import ListCard from "../ui/ListCard.vue";
import RouteThumbnail from "./RouteThumbnail.vue";
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { useCardMenu } from "../../composables/useCardMenu";
import { useConfirmTap } from "../../composables/useConfirmTap";
import { useDragReorder } from "../../composables/useDragReorder";
import { useToast } from "../../composables/useToast";
import { useRouter } from "vue-router";
import type { PlannedRoute } from "../../services/plannedRouteService";

const emit = defineEmits<{ edit: [route: PlannedRoute]; start: [route: PlannedRoute]; create: [] }>();

const plannedRouteStore = usePlannedRouteStore();
const deleteConfirm = useConfirmTap((id) => id && plannedRouteStore.remove(id));
const { toast } = useToast();
const router = useRouter();

/** Drag-to-reorder, same composable/pattern as RoutineList.vue's own reorder. */
const { draggingIndex, onPointerDown, styleFor } = useDragReorder((from, to) => {
  const ids = plannedRouteStore.routes.map((r) => r.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved!);
  plannedRouteStore.reorder(ids).catch(() => {
    toast("Sortierung konnte nicht gespeichert werden.");
    void plannedRouteStore.load();
  });
});

function handleDragDown(e: PointerEvent, index: number, cardEl: HTMLElement | null) {
  if (!cardEl) return;
  onPointerDown(e, index, plannedRouteStore.routes.length, cardEl);
}

// Same reasoning as RoutineList.vue: useDragReorder assumes one column, so the drag handle is
// only rendered/wired at the single-column (<900px) breakpoint the grid itself switches on.
const dragReorderBreakpoint = "(min-width: 900px)";
const isDesktopGrid = ref(typeof window !== "undefined" ? window.matchMedia(dragReorderBreakpoint).matches : false);
let dragBreakpointMql: MediaQueryList | null = null;
if (typeof window !== "undefined") {
  dragBreakpointMql = window.matchMedia(dragReorderBreakpoint);
  const syncIsDesktopGrid = (e: MediaQueryListEvent | MediaQueryList) => {
    isDesktopGrid.value = e.matches;
  };
  dragBreakpointMql.addEventListener("change", syncIsDesktopGrid);
  onBeforeUnmount(() => dragBreakpointMql?.removeEventListener("change", syncIsDesktopGrid));
}
const canDragReorder = computed(() => !isDesktopGrid.value);

/** Opens the route's detail screen — mirrors RoutineList.vue's openOverview() drill-in pattern. */
function openOverview(routeId: string) {
  void router.push(`/routes/${routeId}`);
}

// Per-card ⋮ menu (Starten lives on the card itself; Bearbeiten/Löschen here) — same
// useCardMenu composable as RoutineList.vue's useRoutineManagement, so both lists dismiss the
// same way (outside click / Escape, one open id at a time).
const { openMenuId, toggleMenu, closeMenu } = useCardMenu();

function editFromMenu(route: PlannedRoute) {
  closeMenu();
  emit("edit", route);
}
</script>

<template>
  <CardListScreen>
    <CardGrid v-if="plannedRouteStore.routes.length > 0">
      <ListCard
        v-for="(route, i) in plannedRouteStore.routes"
        :key="route.id"
        :dragging="draggingIndex === i"
        :drag-style="styleFor(i)"
        :title="route.name"
        @open="openOverview(route.id)"
      >
        <template v-if="canDragReorder" #drag-handle>
          <button
            class="rc-drag-handle"
            aria-label="Verschieben"
            @pointerdown="handleDragDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.card') as HTMLElement)"
            @click.stop
          >
            <AppIcon name="drag-handle" />
          </button>
        </template>
        <template #menu>
          <button
            class="btn-icon"
            aria-label="Mehr"
            :aria-expanded="openMenuId === route.id"
            @click="toggleMenu(route.id)"
          >
            <AppIcon name="more" />
          </button>
          <div v-if="openMenuId === route.id" class="card-menu">
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
        </template>

        <RouteThumbnail :points="route.polyline" :approximate="route.geometrySource === 'straight'" />

        <template #meta>
          {{ (route.distanceM / 1000).toFixed(2) }} km{{ route.geometrySource === "straight" ? " ≈" : "" }} ·
          {{ route.elevationGainM != null ? Math.round(route.elevationGainM) + " hm" : "Höhe unbekannt" }}
        </template>

        <template #actions>
          <button class="btn-secondary" @click="emit('start', route)">Starten</button>
        </template>
      </ListCard>
    </CardGrid>
    <p v-if="plannedRouteStore.routes.length > 0" class="map-credit">Karten © OpenStreetMap contributors</p>
    <div v-else class="route-empty surface-hybrid">
      <div class="eyebrow">Noch keine Strecke</div>
      <p>Platziere Wegpunkte auf der Karte und speichere sie als wiederverwendbare Strecke.</p>
      <button class="btn-primary" @click="emit('create')">+ Neue Strecke</button>
    </div>
    <button v-if="plannedRouteStore.routes.length > 0" class="btn-secondary route-list-add" @click="emit('create')">+ Neue Strecke</button>
  </CardListScreen>
</template>

<style scoped>
/* Outer radius minus this card's own padding, so the thumbnail nests snugly instead of using its
   default (--r-md, 16px) — recomputed for each breakpoint's own radius/padding pair in ListCard's
   shared .card rule (styles/list-card.css). `.card` here reaches ListCard.vue's root element
   because Vue stamps a parent's scoped attribute onto a child component's root node. */
.card :deep(.route-thumb-map) {
  border-radius: 6px;
}
@media (min-width: 900px) {
  .card :deep(.route-thumb-map) {
    border-radius: 4px;
  }
}
.map-credit {
  margin-top: var(--sp2);
  color: var(--faint);
  font-size: 11px;
}
.route-list-add {
  margin-top: var(--sp3);
}
/* Same handle treatment as RoutineList.vue's .rc-drag-handle. */
.rc-drag-handle {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 16px;
  touch-action: none;
  cursor: grab;
}
.route-empty p {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
  margin-bottom: var(--sp3);
}
</style>
