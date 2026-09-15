<script setup lang="ts">
/**
 * Single-screen creation/edit sheet for a planned route (Strecke): pinned header (close + name
 * input) → map filling the remaining height → pinned bottom bar with live stats + "Speichern".
 * No multi-step machine — a route only ever needs one screen, and the whole thing must never
 * itself scroll — dragging to scroll would instead pan/drag the map underneath, trapping the
 * gesture. That "map fills the remaining height" layout needs `SheetModal`'s `fill-body` prop
 * (see its own doc) to actually hold: without it, `.wizard-map`'s `flex: 1` had no flex container
 * to grow inside, and `RouteMapEditor`'s own min-height floor decided the real height instead —
 * once that floor plus the header/footer exceeded the viewport, the sheet scrolled.
 *
 * `SheetModal.vue` emits no `did-present` event, so there's nothing here to invalidate the map's
 * size on modal-present. That's fine: RouteMapEditor mounts on `LeafletMapBase.vue`, whose live
 * `ResizeObserver` keeps calling `invalidateSize()` for as long as the map exists, so a
 * still-animating sheet settling into its final size is handled regardless of timing.
 */
import { computed, ref, watch } from "vue";
import { generateLoopWaypoints, pathDistanceM } from "@liftr/shared";
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
import WizardHeader from "../ui/WizardHeader.vue";
import { ApiError } from "../../lib/api";

const props = defineProps<{
  route?: PlannedRoute | null;
  initialCenter?: { lat: number; lon: number };
  /** Pre-fills a brand-new route (only used when `route` is unset) from an already-recorded
   *  track — e.g. RunDetail.vue's "Als Strecke speichern" turning a finished run's GPS points
   *  into a reusable route. Goes through the exact same waypoints/preview/save path as manually
   *  placed points, so the ORS preview still runs and the user can still drag/add/remove points
   *  before saving. */
  seedWaypoints?: Waypoint[];
  seedName?: string;
}>();
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

/** Set once the user removes a generated point, which is the only way to tell "no arc has been
 *  generated yet" apart from "the user looked at the arc and threw it away". Without the
 *  distinction, `generateArcIfNeeded`'s `some(w => w.gen)` guard flips back the moment the last
 *  generated point is deleted and a brand-new arc reappears ~400 ms later, silently undoing the
 *  deletion and contradicting this file's own promise that gen points are never regenerated
 *  (findings B2). Cleared only by hydrating a different route, or by the user explicitly asking for
 *  a loop again via the toggle — not by further tapping, since a dismissal is a statement about the
 *  feature, not about one particular arc. */
const arcDismissed = ref(false);

/** What actually gets routed/saved: the raw waypoints plus, when closeLoop is on, a synthetic
 *  final point back at the start. Kept separate from `waypoints` so the map's editable markers
 *  (RouteMapEditor's :waypoints prop below) only ever show points the user actually placed. */
const effectiveWaypoints = computed(() =>
  closeLoop.value && waypoints.value.length >= 2 ? [...waypoints.value, { ...waypoints.value[0]! }] : waypoints.value,
);

const distanceM = computed(() =>
  routedPoints.value.length > 0 ? lastComputedDistanceM.value : pathDistanceM(effectiveWaypoints.value),
);
// Generated loop points don't count toward "is there a real route here" — otherwise the loop
// toggle alone (with 0 user-placed points) could satisfy this.
const canSave = computed(
  () => name.value.trim().length > 0 && userWaypointCount.value >= 2 && effectiveWaypoints.value.length <= SERVER_MAX_WAYPOINTS,
);

// Server cap is 50 waypoints total (packages/server/src/routes/plannedRoutes.ts's
// waypointsSchema); effectiveWaypoints above adds one more for the closing point, so the
// generator gets whatever's left after the user's own points.
const SERVER_MAX_WAYPOINTS = 50;

/** How many points the generator asks for by default — mirrors @liftr/shared's DEFAULT_COUNT.
 *  Reserved out of the budget below so the return-leg bulge doesn't silently thin out and vanish
 *  as the user approaches the server's cap (findings B4). */
const RESERVED_ARC_WAYPOINTS = 3;

/** The user's own budget: the server's 50 minus the synthetic closing point and the arc's own
 *  points when the loop is on. Enforced on the way in (onAdd below) rather than discovered on the
 *  way out as a 400 that no amount of retrying will fix. */
const maxUserWaypoints = computed(() =>
  closeLoop.value ? SERVER_MAX_WAYPOINTS - 1 - RESERVED_ARC_WAYPOINTS : SERVER_MAX_WAYPOINTS,
);
const userWaypointCount = computed(() => waypoints.value.filter((w) => !w.gen).length);

/** Generates the arc once closeLoop is on and there isn't one yet. Called from the *debounced*
 *  preview scheduler below (schedulePreview), not straight from onAdd — closeLoop defaults to
 *  true on a brand-new route, so generating eagerly the instant a 2nd waypoint lands would bridge
 *  only those first two points and ignore every waypoint placed after, since gen points, once
 *  present, are never regenerated (see setCloseLoop's own doc for why). Riding the same debounce
 *  the ORS preview already uses means it only fires once the user actually pauses, by which point
 *  every waypoint they meant to place is there — and it still covers the "toggle already on,
 *  never fires a change event" case this exists for in the first place. No-ops (via
 *  generateLoopWaypoints's own guard) below 2 waypoints, and is a no-op whenever a generated arc
 *  already exists. */
function generateArcIfNeeded() {
  if (!closeLoop.value || arcDismissed.value || waypoints.value.some((w) => w.gen)) return;
  const maxCount = Math.max(0, SERVER_MAX_WAYPOINTS - 1 - waypoints.value.length);
  const generated = generateLoopWaypoints(waypoints.value, { maxCount }).map((w) => ({ ...w, gen: true }));
  if (generated.length > 0) waypoints.value = [...waypoints.value, ...generated];
}

/** User-driven toggle handler (bound to the checkbox below), distinct from the plain
 *  `closeLoop.value = …` assignment hydrateFrom uses — hydrating a saved route must never
 *  synthesize a new arc or strip an existing one, only a manual flip should. */
function setCloseLoop(checked: boolean) {
  closeLoop.value = checked;
  if (checked) {
    // Ticking the box is the user asking for a loop, which overrides an earlier dismissal — it's
    // also the only affordance in this sheet for getting a discarded arc back.
    arcDismissed.value = false;
    generateArcIfNeeded();
  } else if (waypoints.value.some((w) => w.gen)) {
    waypoints.value = waypoints.value.filter((w) => !w.gen);
  }
}

async function hydrateFrom(route: PlannedRoute | null | undefined) {
  if (!route) {
    name.value = props.seedName ?? "";
    arcDismissed.value = false;
    waypoints.value = props.seedWaypoints ? [...props.seedWaypoints] : [];
    routedPoints.value = [];
    geometrySource.value = "straight";
    lastComputedDistanceM.value = 0;
    elevationGainM.value = null;
    // A seeded run track is a point-to-point path, not a loop back to its own start.
    closeLoop.value = props.seedWaypoints ? false : true;
    if (props.seedWaypoints && props.seedWaypoints.length >= 2) void runPreview();
    return;
  }
  name.value = route.name;
  arcDismissed.value = false;
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
  previewTimer = setTimeout(() => {
    // Runs on the same debounce as the ORS preview itself — see generateArcIfNeeded's own doc for
    // why this can't just happen straight from onAdd.
    generateArcIfNeeded();
    void runPreview();
  }, 400);
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
  if (userWaypointCount.value >= maxUserWaypoints.value) {
    toast(`Maximal ${maxUserWaypoints.value} Wegpunkte — entferne zuerst einen Punkt.`);
    return;
  }
  if (!arcDismissed.value && waypoints.value.some((w) => w.gen)) {
    // A new tap after the arc has already generated invalidates it twice over: appending behind it
    // would make the route visit the arc and then jump back out to the new point (a zigzag that
    // saves without complaint — findings B3), and the arc was computed from a different final
    // waypoint and therefore a different approach heading. Drop it; the debounce rebuilds it from
    // the full updated path.
    waypoints.value = [...waypoints.value.filter((w) => !w.gen), waypoint];
  } else {
    // The arc was dismissed, so any surviving generated points are ones the user deliberately kept
    // — effectively their own return leg now. Slot the new tap in after the last point they placed
    // rather than destroying them. (reduce, not findLastIndex: lib is ES2022.)
    const lastUserIdx = waypoints.value.reduce((acc, w, i) => (w.gen ? acc : i), -1);
    waypoints.value = [
      ...waypoints.value.slice(0, lastUserIdx + 1),
      waypoint,
      ...waypoints.value.slice(lastUserIdx + 1),
    ];
  }
  schedulePreview();
}
function onMove(index: number, waypoint: Waypoint) {
  waypoints.value = waypoints.value.map((w, i) => (i === index ? waypoint : w));
  schedulePreview();
}
function onRemove(index: number) {
  if (waypoints.value[index]?.gen) arcDismissed.value = true;
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

/** The server's 400 body carries Zod's own English message as `detail` (see app.ts's error
 *  handler) — diagnostic, not user copy, and this UI is German. So: a German sentence chosen by
 *  status, and the detail to the console for whoever is debugging. The old catch-all told the user
 *  to try again for every failure, which is actively wrong on a 400: the same waypoints fail
 *  identically every time (findings B4). */
function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detail) console.warn("Strecke abgelehnt:", err.status, err.detail);
    if (err.status === 400) return "Strecke abgelehnt — zu viele oder ungültige Wegpunkte.";
    if (err.status === 429) return "Zu viele Anfragen — bitte kurz warten.";
  }
  return "Speichern fehlgeschlagen — bitte erneut versuchen.";
}

async function save() {
  if (!canSave.value) return;
  // The arc normally lands on the 400 ms debounce (see generateArcIfNeeded's doc for why it can't
  // fire straight from onAdd). Saving is the one moment where waiting for it is pointless — there
  // are no more taps coming — and where skipping it is destructive: effectiveWaypoints would be
  // read with the timer still pending and the route would persist as a straight closing line with
  // "Schleife schließen" checked, which hydrateFrom then never repairs (findings B1). This call is
  // a no-op when an arc already exists, and the pending timer is deliberately left running so its
  // runPreview() still refreshes the sheet if the save fails.
  generateArcIfNeeded();
  saving.value = true;
  try {
    if (props.route) {
      await plannedRouteStore.update(props.route.id, { name: name.value.trim(), waypoints: effectiveWaypoints.value });
    } else {
      await plannedRouteStore.create(name.value.trim(), effectiveWaypoints.value);
    }
    emit("saved");
    sheetRef.value?.dismiss();
  } catch (err) {
    toast(saveErrorMessage(err));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SheetModal ref="sheetRef" :sheet="false" fill-body background="var(--bg)" @close="emit('close')">
    <template #header>
      <WizardHeader
        v-model:title="name"
        :title-placeholder="'Name der Strecke'"
        :is-confirming-close="closeConfirm.isArmed()"
        @close="requestClose"
      />
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
          <span :class="{ 'stat-warn': userWaypointCount >= maxUserWaypoints - 5 }">
            {{ userWaypointCount >= maxUserWaypoints - 5 ? `${userWaypointCount}/${maxUserWaypoints}` : userWaypointCount }}
            Wegpunkte
          </span>
        </div>
        <label class="loop-toggle">
          <input
            :checked="closeLoop"
            type="checkbox"
            @change="setCloseLoop(($event.target as HTMLInputElement).checked)"
          />
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
/* Only appears in the last five waypoints before the cap — the footer row is tight on a 375px
   viewport, so the counter stays a plain number until the limit is actually relevant. */
.stat-warn {
  color: var(--danger);
}
/* min-height + horizontal padding puts the whole label (not just the ~13px checkbox glyph) at
   the app's --touch-target-min — otherwise this is the one interactive control in the route flow
   that isn't a real 44px tap target. */
.loop-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: var(--touch-target-min);
  padding: 0 var(--sp2);
  margin-right: calc(var(--sp2) * -1);
  font-size: 0.85rem;
  color: var(--dim);
  white-space: nowrap;
}
.loop-toggle input {
  width: 20px;
  height: 20px;
}
</style>
