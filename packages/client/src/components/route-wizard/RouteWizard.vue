<script setup lang="ts">
/**
 * Single-screen creation/edit sheet for a planned route (Strecke): pinned header (close + name
 * input) → map filling the remaining height → pinned bottom bar with live stats + "Speichern".
 * No multi-step machine — a route only ever needs one screen.
 *
 * `SheetModal.vue` does not emit a `did-present` (or any `ionDidPresent`-forwarded) event — it
 * only ever emits `close`, deferred a frame past IonModal's own `did-dismiss` (see that file's
 * header comment). So there's nothing here to invalidate the map's size on modal-present; the
 * map itself already double-guards with its own `requestAnimationFrame(() => map?.invalidateSize())`
 * at mount, so a possibly-still-animating sheet degrades to "usually fine, occasionally a grey
 * box on a slow device," not broken.
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

const distanceM = computed(() =>
  routedPoints.value.length > 0 ? lastComputedDistanceM.value : pathDistanceM(waypoints.value),
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
    return;
  }
  name.value = route.name;
  waypoints.value = route.waypoints.map((w) => ({ ...w }));
  geometrySource.value = route.geometrySource;
  lastComputedDistanceM.value = route.distanceM;
  elevationGainM.value = route.elevationGainM;
  // Populate the saved snapped geometry so distanceM (below) uses the route's real saved
  // distance instead of falling back to a straight-line recompute, the ≈ marker stays accurate
  // to geometrySource, and RouteMapEditor draws the actual saved line instead of a raw waypoint
  // polyline. Same fetch RunDetail.vue already uses to resolve a route's detail.
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
    const result = await previewPlannedRoute(waypoints.value, previewController.signal);
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
      await plannedRouteStore.update(props.route.id, { name: name.value.trim(), waypoints: waypoints.value });
    } else {
      await plannedRouteStore.create(name.value.trim(), waypoints.value);
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
  <!-- @close only fires after Ionic's own dismiss teardown completes (see SheetModal.vue's header
       comment) — it's the single place that tells the parent it's safe to unmount (RunsPage.vue
       flips showRouteWizard to false there), never resolved here directly. -->
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
      <div class="stats">
        <span>{{ (distanceM / 1000).toFixed(2) }} km{{ geometrySource === "straight" ? " ≈" : "" }}</span>
        <span>{{ elevationGainM != null ? Math.round(elevationGainM) + " hm" : "Höhe unbekannt" }}</span>
        <span>{{ waypoints.length }} Wegpunkte</span>
      </div>
      <button class="btn-primary" :disabled="!canSave || saving" @click="save">Speichern</button>
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
  background: var(--red-lo);
  border-color: var(--red);
  color: var(--text);
}
.wizard-map {
  flex: 1;
  min-height: 0;
}
.wizard-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
}
.stats {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
  color: var(--dim);
}
</style>
