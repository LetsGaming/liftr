<script setup lang="ts">
/**
 * Single-screen creation/edit sheet for a planned route (Strecke): pinned header (close + name
 * input) → map filling the remaining height → pinned bottom bar with live stats + "Speichern".
 * No multi-step machine — a route only ever needs one screen.
 *
 * `SheetModal.vue` emits no `did-present` event, so there's nothing here to invalidate the map's
 * size on modal-present. That's fine: RouteMapEditor mounts on `LeafletMapBase.vue`, whose live
 * `ResizeObserver` keeps calling `invalidateSize()` for as long as the map exists, so a
 * still-animating sheet settling into its final size is handled regardless of timing.
 */
import { computed, ref, watch } from "vue";
import { pathDistanceM } from "@liftr/shared";
import SheetModal from "../ui/SheetModal.vue";
import RouteMapEditor from "../route/RouteMapEditor.vue";
import { useConfirmTap } from "../../composables/useConfirmTap";
import { useToast } from "../../composables/useToast";
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import {
  getPlannedRouteDetail,
  previewPlannedRoute,
  type PlannedRoute,
  type RoutePoint,
  type Waypoint,
} from "../../services/plannedRouteService";

const props = defineProps<{ route?: PlannedRoute | null; initialCenter?: { lat: number; lon: number } }>();
const emit = defineEmits<{ saved: []; close: [] }>();

const plannedRouteStore = usePlannedRouteStore();
const { toast } = useToast();

const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);
const name = ref("");
const waypoints = ref<Waypoint[]>([]);
const routedPoints = ref<RoutePoint[]>([]);
const geometrySource = ref<"ors" | "straight">("straight");
const lastComputedDistanceM = ref(0);
const elevationGainM = ref<number | null>(null);
const saving = ref(false);

/** Whether the drawn path connects back to the starting waypoint (a loop) vs. a point-to-point
 *  route. User-configurable so a walk from A to B doesn't get an unwanted closing leg back to A. */
const closeLoop = ref(true);

/** What actually gets routed/saved: the raw waypoints plus, when closeLoop is on, a synthetic
 *  final point back at the start. Kept separate from `waypoints` so the map's editable markers
 *  (RouteMapEditor's :waypoints prop below) only ever show points the user actually placed. */
const effectiveWaypoints = computed(() =>
  closeLoop.value && waypoints.value.length >= 2 ? [...waypoints.value, { ...waypoints.value[0]! }] : waypoints.value,
);

const distanceM = computed(() =>
  routedPoints.value.length > 0 ? lastComputedDistanceM.value : pathDistanceM(effectiveWaypoints.value),
);
const canSave = computed(() => name.value.trim().length > 0 && waypoints.value.length >= 2);

async function hydrateFrom(route: PlannedRoute | null | undefined) {
  if (!route) {
    name.value = "";
    waypoints.value = [];
    routedPoints.value = [];
    geometrySource.value = "straight";
    lastComputedDistanceM.value = 0;
    elevationGainM.value = null;
    closeLoop.value = true;
    return;
  }
  name.value = route.name;
  const savedWaypoints = route.waypoints.map((w) => ({ ...w }));
  // A saved closed loop persists its synthetic closing point as an ordinary waypoint (there's no
  // separate "is this a loop" column). Strip it back off so re-editing doesn't compound another
  // one via effectiveWaypoints below, and re-derive the toggle from whether it ends at its start.
  const first = savedWaypoints[0];
  const last = savedWaypoints[savedWaypoints.length - 1];
  const wasClosedLoop =
    savedWaypoints.length >= 3 && first != null && last != null && first.lat === last.lat && first.lon === last.lon;
  waypoints.value = wasClosedLoop ? savedWaypoints.slice(0, -1) : savedWaypoints;
  closeLoop.value = wasClosedLoop;
  geometrySource.value = route.geometrySource;
  lastComputedDistanceM.value = route.distanceM;
  elevationGainM.value = route.elevationGainM;
  // Populate the saved snapped geometry so distanceM uses the route's real saved distance
  // instead of a straight-line recompute, and RouteMapEditor draws the saved line instead of a
  // raw waypoint polyline. Same fetch RunDetail.vue uses to resolve a route's detail.
  routedPoints.value = [];
  try {
    const detail = await getPlannedRouteDetail(route.id);
    routedPoints.value = detail.points;
  } catch {
    // Detail fetch failed — falls back to the straight-line distance/rendering, same non-event
    // handling as a failed preview below.
  }
}
watch(() => props.route, hydrateFrom, { immediate: true });

let previewController: AbortController | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 400);
}

async function runPreview() {
  if (waypoints.value.length < 2) {
    routedPoints.value = [];
    return;
  }
  previewController?.abort();
  previewController = new AbortController();
  try {
    const result = await previewPlannedRoute(effectiveWaypoints.value, previewController.signal);
    routedPoints.value = result.points;
    geometrySource.value = result.geometrySource;
    lastComputedDistanceM.value = result.distanceM;
    elevationGainM.value = result.elevationGainM;
  } catch {
    // A failed/aborted preview is a non-event — the straight line and its ≈ label just stay.
  }
}

function onAdd(waypoint: Waypoint) {
  waypoints.value = [...waypoints.value, waypoint];
  schedulePreview();
}
function onMove(index: number, waypoint: Waypoint) {
  waypoints.value = waypoints.value.map((w, i) => (i === index ? waypoint : w));
  schedulePreview();
}
function onRemove(index: number) {
  waypoints.value = waypoints.value.filter((_, i) => i !== index);
  schedulePreview();
}
watch(closeLoop, schedulePreview);

const closeConfirm = useConfirmTap(() => sheetRef.value?.dismiss());
function requestClose() {
  if (waypoints.value.length === 0) {
    sheetRef.value?.dismiss();
    return;
  }
  closeConfirm.trigger();
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    if (props.route) {
      await plannedRouteStore.update(props.route.id, { name: name.value.trim(), waypoints: effectiveWaypoints.value });
    } else {
      await plannedRouteStore.create(name.value.trim(), effectiveWaypoints.value);
    }
    emit("saved");
    sheetRef.value?.dismiss();
  } catch {
    toast("Speichern fehlgeschlagen — bitte erneut versuchen.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SheetModal ref="sheetRef" :sheet="false" background="var(--bg)" @close="emit('close')">
    <template #header>
      <header class="wizard-head">
        <button class="btn-close close-btn" :class="{ confirming: closeConfirm.isArmed() }" aria-label="Schließen" @click="requestClose">
          {{ closeConfirm.isArmed() ? "Verwerfen?" : "×" }}
        </button>
        <input v-model="name" class="name-input" type="text" placeholder="Name der Strecke" aria-label="Name der Strecke" />
      </header>
    </template>
    <RouteMapEditor
      class="wizard-map"
      :waypoints="waypoints"
      :routed-points="routedPoints"
      :approximate="geometrySource === 'straight'"
      :initial-center="initialCenter"
      @add="onAdd"
      @move="onMove"
      @remove="onRemove"
    />
    <footer class="wizard-foot">
      <div class="wizard-foot-row">
        <div class="stats">
          <span>{{ (distanceM / 1000).toFixed(2) }} km{{ geometrySource === "straight" ? " ≈" : "" }}</span>
          <span>{{ elevationGainM != null ? Math.round(elevationGainM) + " hm" : "Höhe unbekannt" }}</span>
          <span>{{ waypoints.length }} Wegpunkte</span>
        </div>
        <label class="loop-toggle">
          <input v-model="closeLoop" type="checkbox" />
          Schleife schließen
        </label>
      </div>
      <button class="btn-primary btn-block" :disabled="!canSave || saving" @click="save">Speichern</button>
    </footer>
  </SheetModal>
</template>

<style scoped>
.wizard-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.name-input {
  flex: 1;
  min-height: 44px;
  border: none;
  background: transparent;
  font-size: 1.05rem;
}
.close-btn {
  min-width: 44px;
  min-height: 44px;
}
/* Armed-to-discard state — mirrors WorkoutPage.vue's .cancel-btn.confirming and
   RouteMapEditor.vue's own waypoint .confirming treatment for the same tap-to-arm pattern. */
.close-btn.confirming {
  background: var(--danger-lo);
  border-color: var(--danger);
  color: var(--text);
}
.wizard-map {
  flex: 1;
  min-height: 0;
}
.wizard-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
}
.wizard-foot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.stats {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
  color: var(--dim);
}
.loop-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--dim);
  white-space: nowrap;
}
</style>
