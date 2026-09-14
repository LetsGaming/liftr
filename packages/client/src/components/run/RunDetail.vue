<script setup lang="ts">
/**
 * Past-run detail sheet — "Letzte Aktivität" run rows on OverviewPage.vue were permanently
 * `disabled`, the only feed row that visibly did nothing when tapped, unlike workout rows which
 * already open WorkoutDetail.vue. Mirrors WorkoutDetail.vue's exact pattern: a sheet built on the
 * shared SheetModal.vue, loading full detail on mount via a store action that already existed
 * (runsStore.loadDetail()/getRunDetail — built for RunsPage.vue's inline layout, never reused from
 * a modal before). Reuses RunReplay.vue (which itself wraps RunMap.vue) for the route visualization
 * exactly as RunsPage.vue does, rather than duplicating map/replay logic here.
 */
import { nearestRunCategory, type RunCategory } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { useRunsStore, type RunDetail as RunDetailModel } from "../../stores/runsStore";
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { useRunRankStore } from "../../stores/runRankStore";
import { getPlannedRouteDetail, type Waypoint } from "../../services/plannedRouteService";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import { useConfirmTap } from "../../composables/useConfirmTap";
import AppIcon from "../ui/AppIcon.vue";
import RouteWizard from "../route-wizard/RouteWizard.vue";
import RunReplay from "./RunReplay.vue";
import SheetModal from "../ui/SheetModal.vue";
import StatTile from "../ui/StatTile.vue";

const props = defineProps<{ runId: string }>();
const emit = defineEmits<{ close: [] }>();

const runsStore = useRunsStore();
const plannedRouteStore = usePlannedRouteStore();
const runRankStore = useRunRankStore();
const loading = ref(true);
const detail = ref<RunDetailModel | null>(null);
const deleting = ref(false);
const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);

/** Mirrors WorkoutDetail.vue's own delete pattern: refresh the rank/PR data this sheet itself
 *  displays (deleting a run can change or remove a rank-up/PR it earned), close via
 *  sheetRef.dismiss() rather than a direct emit — see SheetModal.vue's header comment for why a
 *  direct emit/unmount here would race Ionic's own modal teardown. */
const deleteConfirm = useConfirmTap(async () => {
  deleting.value = true;
  try {
    await runsStore.deleteRun(props.runId);
    await Promise.all([runRankStore.loadRanks(), runRankStore.loadPrs()]);
    sheetRef.value?.dismiss();
  } finally {
    deleting.value = false;
  }
});

// Rank/PR chip — same convention as RunsPage.vue's own selectedRunCategory/selectedRunRank/
// selectedRunIsPr (see that file's comment for why manual runs are excluded explicitly rather
// than relying on runRanks/runPrs simply having no matching rows), and the same
// locally-duplicated RUN_CATEGORY_LABEL RanksPage.vue/RecordsPage.vue/RunsPage.vue each already
// keep their own copy of.
const RUN_CATEGORY_LABEL: Record<RunCategory, string> = {
  mile: "Meile",
  "5k": "5 km",
  "10k": "10 km",
  half_marathon: "Halbmarathon",
  marathon: "Marathon",
};
const detailCategory = computed<RunCategory | null>(() => {
  const d = detail.value;
  if (!d || d.source === "manual") return null;
  return nearestRunCategory(d.distanceM);
});
const detailRank = computed(() => {
  const category = detailCategory.value;
  if (!category) return null;
  return runRankStore.ranks.find((r) => r.category === category) ?? null;
});
const detailIsPr = computed(() => {
  const d = detail.value;
  if (!d || d.source === "manual") return false;
  return runRankStore.prs.some((p) => p.runId === d.id);
});
// A run can reference a planned route that's since been soft-archived — archived routes are
// deliberately excluded from plannedRouteStore's active list (GET /api/planned-routes), so
// resolving one for the chip below falls back to a direct by-id fetch, cached here rather than
// in the global store since this is a display-only edge case, not part of the app's "active
// routes" list semantics.
const archivedRouteCache = ref<Record<string, string | null>>({});
const sourceRouteName = computed(() => {
  const id = detail.value?.plannedRouteId;
  if (!id) return null;
  return plannedRouteStore.byId(id)?.name ?? archivedRouteCache.value[id] ?? null;
});

onMounted(async () => {
  const routesLoaded = plannedRouteStore.loaded ? Promise.resolve() : plannedRouteStore.load();
  // Non-blocking, same as RunsPage.vue's own mount — the chip/badge below just render nothing
  // until these resolve.
  if (!runRankStore.ranksLoaded) void runRankStore.loadRanks();
  if (!runRankStore.prsLoaded) void runRankStore.loadPrs();
  try {
    detail.value = await runsStore.loadDetail(props.runId);
  } catch {
    // offline or request failed — `detail` stays null, template shows the "couldn't load" hint
  } finally {
    loading.value = false;
  }

  const routeId = detail.value?.plannedRouteId;
  if (routeId) {
    await routesLoaded;
    if (!plannedRouteStore.byId(routeId) && archivedRouteCache.value[routeId] === undefined) {
      try {
        archivedRouteCache.value[routeId] = (await getPlannedRouteDetail(routeId)).name;
      } catch {
        archivedRouteCache.value[routeId] = null;
      }
    }
  }
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}
function formatDuration(s: number) {
  const m = Math.round(s / 60);
  return `${m} min`;
}
function formatPace(sPerKm: number | null) {
  if (sPerKm == null) return "–";
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}

// "Als Strecke speichern" — turns this run's recorded GPS track into a reusable planned route.
// RouteWizard only ever takes user-placed waypoints, so the full point-by-point track (hundreds
// of GPS fixes) is stride-sampled down to a manageable handful the user can still see/drag/edit
// before saving, rather than dumping every fix onto the map as its own marker.
const ROUTE_SEED_TARGET_WAYPOINTS = 20;
const showRouteWizard = ref(false);
const routeSeedWaypoints = computed<Waypoint[]>(() => {
  const points = detail.value?.points ?? [];
  if (points.length === 0) return [];
  const stride = Math.max(1, Math.ceil(points.length / ROUTE_SEED_TARGET_WAYPOINTS));
  const sampled = points.filter((_, i) => i % stride === 0).map((p) => ({ lat: p.lat, lon: p.lon }));
  const last = points[points.length - 1]!;
  if (sampled[sampled.length - 1]?.lat !== last.lat || sampled[sampled.length - 1]?.lon !== last.lon) {
    sampled.push({ lat: last.lat, lon: last.lon });
  }
  return sampled;
});
const routeSeedName = computed(() => detail.value?.name ?? formatDate(detail.value?.startedAt ?? new Date().toISOString()));
</script>

<template>
  <SheetModal
    ref="sheetRef"
    :title="detail?.name ?? 'Lauf-Details'"
    width="100%"
    max-width="94vw"
    height="88%"
    desktop-variant="drawer"
    desktop-width="560px"
    desktop-height="100%"
    @close="emit('close')"
  >
    <p v-if="loading" class="hint">Lädt…</p>
    <p v-else-if="!detail" class="hint">Dieser Lauf ließ sich nicht laden — möglicherweise keine Verbindung zum Server.</p>

    <template v-else>
      <div class="date-line tnum">{{ formatDate(detail.startedAt) }}</div>

      <div v-if="sourceRouteName" class="route-chip">Strecke: {{ sourceRouteName }}</div>
      <div v-if="detailRank" class="route-chip rank-chip pop-in">
        {{ RUN_CATEGORY_LABEL[detailCategory!] }} · {{ TIER_LABEL_DE[detailRank.tier as RankTier] }}
        {{ DIVISION_LABEL[detailRank.division] }}
      </div>
      <div v-if="detailIsPr" class="route-chip pr-chip pop-in">Neuer Rekord</div>
      <div class="stat-row">
        <StatTile :value="`${(detail.distanceM / 1000).toFixed(2)} km`" label="Distanz" />
        <StatTile :value="formatDuration(detail.durationS)" label="Dauer" />
        <StatTile :value="formatPace(detail.avgPaceSPerKm)" label="Pace ø" />
        <StatTile :value="detail.avgHr != null ? Math.round(detail.avgHr) + ' bpm' : '–'" label="Puls ø" />
        <StatTile v-if="detail.elevationGainM != null" :value="Math.round(detail.elevationGainM) + ' hm'" label="Höhenmeter" />
      </div>

      <RunReplay v-if="detail.points.length > 0" :points="detail.points" />
      <p v-else class="hint">Manuell erfasster Lauf — keine Route verfügbar.</p>

      <button v-if="detail.points.length > 0" class="btn-secondary btn-block save-route-btn" @click="showRouteWizard = true">
        <AppIcon name="running" /> Als Strecke speichern
      </button>

      <button
        class="btn-secondary btn-block delete-btn"
        :class="{ confirming: deleteConfirm.isArmed() }"
        :disabled="deleting"
        @click="deleteConfirm.trigger()"
      >
        <template v-if="deleting">Wird gelöscht…</template>
        <template v-else-if="deleteConfirm.isArmed()">Wirklich löschen?</template>
        <template v-else><AppIcon name="trash" /> Lauf löschen</template>
      </button>
    </template>

    <RouteWizard
      v-if="showRouteWizard"
      :seed-waypoints="routeSeedWaypoints"
      :seed-name="routeSeedName"
      @close="showRouteWizard = false"
      @saved="showRouteWizard = false"
    />
  </SheetModal>
</template>

<style scoped>
.hint {
  color: var(--dim);
}
.date-line {
  color: var(--dim);
  font-weight: 700;
  margin-bottom: var(--sp4);
}
.route-chip {
  display: inline-block;
  margin-bottom: var(--sp3);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 700;
}
/* Sits next to the route chip (same visual pattern, reused rather than invented) when
   consecutive chips wrap onto the same line. */
.route-chip + .route-chip {
  margin-left: var(--sp2);
}
/* Same --pr color token WorkoutDetail.vue's/WorkoutPage.vue's strength-side PR chip already
   uses — this is that same "you earned this" accent, not a new color introduced for running. */
.pr-chip {
  color: var(--pr);
  border-color: var(--pr);
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: var(--sp2);
  margin-bottom: var(--sp5);
}
.save-route-btn {
  margin-top: var(--sp4);
}
.delete-btn {
  margin-top: var(--sp3);
  color: var(--danger);
}
.delete-btn.confirming {
  background: var(--danger-lo);
  border-color: var(--danger);
  color: var(--text);
}
</style>
