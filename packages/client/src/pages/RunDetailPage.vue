<script setup lang="ts">
/**
 * Past-run detail — a routed page (was RunDetail.vue's SheetModal sheet), reached via `/runs/:id`
 * for a real URL, back-button semantics, and a cold deep-link, converging with
 * ExerciseDetailPage.vue and WorkoutDetailPage.vue on the same BasePage shell. Title is the run's
 * own `name` (or a fallback), loaded from the fetched detail itself rather than a caller-passed
 * prop — no extra plumbing needed for a cold/direct deep-link, unlike WorkoutDetailPage.vue's
 * title (which isn't part of the workout detail payload).
 */
import { cardioActivity, nearestRunCategory, type RankBucket } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRunsStore, type RunDetail as RunDetailModel } from "../stores/runsStore";
import { usePlannedRouteStore } from "../stores/plannedRouteStore";
import { useRunRankStore } from "../stores/runRankStore";
import { getPlannedRouteDetail, type Waypoint } from "../services/plannedRouteService";
import { formatDateLong, formatDistanceKm, formatDurationMinutes, formatPace } from "../lib/format";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../lib/tierIcons";
import { useConfirmTap } from "../composables/useConfirmTap";
import { ACTIVITY_LABEL, RUN_CATEGORY_LABEL } from "../copy/runCopy";
import AppIcon from "../components/base/AppIcon.vue";
import BasePage from "../components/patterns/BasePage.vue";
import Button from "../components/base/Button.vue";
import Chip from "../components/base/Chip.vue";
import RouteWizard from "../components/route/RouteWizard.vue";
import RunReplay from "../components/run/RunReplay.vue";
import StatTile from "../components/patterns/StatTile.vue";

const route = useRoute();
const router = useRouter();
const runId = computed(() => route.params.id as string);

const runsStore = useRunsStore();
const plannedRouteStore = usePlannedRouteStore();
const runRankStore = useRunRankStore();
const loading = ref(true);
const detail = ref<RunDetailModel | null>(null);
const deleting = ref(false);

const pageTitle = computed(() => detail.value?.name ?? "Lauf-Details");

/** Mirrors WorkoutDetailPage.vue's own delete pattern: refresh the rank/PR data this page itself
 *  displays (deleting a run can change or remove a rank-up/PR it earned), then navigate back. */
const deleteConfirm = useConfirmTap(async () => {
  deleting.value = true;
  try {
    await runsStore.deleteRun(runId.value);
    await Promise.all([runRankStore.loadRanks(), runRankStore.loadPrs()]);
    router.back();
  } finally {
    deleting.value = false;
  }
});

// Rank/PR chip — manual runs are excluded explicitly (no run_points means no independent
// plausibility check, so they never earn rank) rather than relying on runRanks/runPrs simply
// having no matching rows. `detailBucket` is distance-derived only for running (the
// distance-ladder activity); a single-speed activity (walk/hike) has exactly one bucket, "all",
// regardless of distance — see cardioActivities.ts's RankMode.
const detailBucket = computed<RankBucket | null>(() => {
  const d = detail.value;
  if (!d || d.source === "manual") return null;
  // Defensive fallback: older cached RunDetail data (or a test fixture predating this field)
  // may not carry activityType — treat it as "run", the pre-existing behavior.
  const mode = cardioActivity(d.activityType ?? "run").rank.mode;
  if (mode === "none") return null;
  return mode === "distance-ladder" ? nearestRunCategory(d.distanceM) : "all";
});
const detailRank = computed(() => {
  const d = detail.value;
  const bucket = detailBucket.value;
  if (!d || !bucket) return null;
  return runRankStore.ranks.find((r) => r.activityType === (d.activityType ?? "run") && r.category === bucket) ?? null;
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
    detail.value = await runsStore.loadDetail(runId.value);
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
const routeSeedName = computed(() => detail.value?.name ?? formatDateLong(detail.value?.startedAt ?? new Date().toISOString()));
</script>

<template>
  <BasePage :title="pageTitle" back-button variant="drawer">
    <p v-if="loading" class="hint">Lädt…</p>
    <p v-else-if="!detail" class="hint">Dieser Lauf ließ sich nicht laden — möglicherweise keine Verbindung zum Server.</p>

    <template v-else>
      <div class="date-line tnum">{{ formatDateLong(detail.startedAt) }}</div>

      <Chip v-if="sourceRouteName" size="sm" class="route-chip">Strecke: {{ sourceRouteName }}</Chip>
      <!-- rank-chip carries no CSS of its own (it shares .route-chip's look on purpose, same row
           as the "Strecke:" chip) — kept only as a stable selector distinguishing this chip from
           its siblings (route/pr) for tests. -->
      <Chip v-if="detailRank" size="sm" class="route-chip rank-chip pop-in">
        {{ ACTIVITY_LABEL[detail.activityType ?? "run"] }}<template v-if="detailBucket !== 'all'"> · {{ RUN_CATEGORY_LABEL[detailBucket!] }}</template>
        · {{ TIER_LABEL_DE[detailRank.tier as RankTier] }} {{ DIVISION_LABEL[detailRank.division] }}
      </Chip>
      <Chip v-if="detailIsPr" size="sm" class="route-chip pr-chip pop-in">Neuer Rekord</Chip>
      <div class="stat-row">
        <StatTile :value="formatDistanceKm(detail.distanceM)" label="Distanz" />
        <StatTile :value="formatDurationMinutes(detail.durationS)" label="Dauer" />
        <StatTile :value="formatPace(detail.avgPaceSPerKm)" label="Pace ø" />
        <StatTile :value="detail.avgHr != null ? Math.round(detail.avgHr) + ' bpm' : '–'" label="Puls ø" />
        <StatTile v-if="detail.elevationGainM != null" :value="Math.round(detail.elevationGainM) + ' hm'" label="Höhenmeter" />
      </div>

      <RunReplay v-if="detail.points.length > 0" :points="detail.points" />
      <p v-else class="hint">Manuell erfasster Lauf — keine Route verfügbar.</p>

      <Button v-if="detail.points.length > 0" variant="secondary" block class="save-route-btn" @click="showRouteWizard = true">
        <template #leading><AppIcon name="running" /></template>
        Als Strecke speichern
      </Button>

      <Button
        variant="secondary"
        block
        class="delete-btn"
        :class="{ confirming: deleteConfirm.isArmed() }"
        :disabled="deleting"
        @click="deleteConfirm.trigger()"
      >
        <template v-if="deleting">Wird gelöscht…</template>
        <template v-else-if="deleteConfirm.isArmed()">Wirklich löschen?</template>
        <template v-else><AppIcon name="trash" /> Lauf löschen</template>
      </Button>
    </template>

    <RouteWizard
      v-if="showRouteWizard"
      :seed-waypoints="routeSeedWaypoints"
      :seed-name="routeSeedName"
      @close="showRouteWizard = false"
      @saved="showRouteWizard = false"
    />
  </BasePage>
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
  margin-bottom: var(--sp3);
  font-size: 12.5px;
}
/* Sits next to the route chip (same visual pattern, reused rather than invented) when
   consecutive chips wrap onto the same line. */
.route-chip + .route-chip {
  margin-left: var(--sp2);
}
/* Same --pr color token WorkoutDetailPage.vue's/WorkoutPage.vue's strength-side PR chip already
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
