<script setup lang="ts">
// Läufe: mirrors WorkoutPage.vue's flat "start" flow — no sub-tabs, saved routes (RouteList) are
// the page's primary content, same as saved routines are Workout's. Individual-run browsing
// (history, replay, delete) lives on OverviewPage.vue's "Letzte Aktivität" now, not here — that's
// where Workout's own finished-session history lives too, so neither tab duplicates it locally.
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import Button from "../components/base/Button.vue";
import RouteList from "../components/route/RouteList.vue";
import RouteWizard from "../components/route/RouteWizard.vue";
import BasePage from "../components/patterns/BasePage.vue";
import TabSwitcher from "../components/patterns/TabSwitcher.vue";
import { useManualRunEntry } from "../composables/useManualRunEntry";
import { useStartPlannedRoute } from "../composables/useStartPlannedRoute";
import { useToast } from "../composables/useToast";
import { getRunDetail } from "../services/runService";
import type { PlannedRoute } from "../services/plannedRouteService";
import { usePlannedRouteStore } from "../stores/plannedRouteStore";
import { useRunsStore } from "../stores/runsStore";

const { t } = useI18n();

const runsStore = useRunsStore();
const plannedRouteStore = usePlannedRouteStore();
const { toast } = useToast();
const router = useRouter();

const showRouteWizard = ref(false);
const editingRoute = ref<PlannedRoute | null>(null);
const initialCenter = ref<{ lat: number; lon: number } | undefined>(undefined);

async function openNewRouteWizard() {
  editingRoute.value = null;
  // Centers a fresh route's map on the user's most recent GPS-tracked run instead of the
  // fallback — RouteMapEditor.vue's own useLastKnownLocation() chain only reaches this far.
  const gpsRun = runsStore.runs.find((r) => r.source !== "manual");
  if (gpsRun) {
    const detail = await getRunDetail(gpsRun.id);
    initialCenter.value = detail.points[0] ? { lat: detail.points[0].lat, lon: detail.points[0].lon } : undefined;
  } else {
    initialCenter.value = undefined;
  }
  showRouteWizard.value = true;
}
function openEditRouteWizard(route: PlannedRoute) {
  editingRoute.value = route;
  showRouteWizard.value = true;
}

const importing = ref(false);
const importError = ref<string | null>(null);
const showManualForm = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const { activeRoute, dismiss: dismissRouteBanner } = useStartPlannedRoute();
const minutesInputRef = ref<HTMLInputElement | null>(null);

const { manualName, manualDate, manualDistanceKm, manualMinutes, manualError, submitting, submitManual } =
  useManualRunEntry(() => {
    showManualForm.value = false;
    manualName.value = "";
    manualDistanceKm.value = "";
    manualMinutes.value = "";
    dismissRouteBanner();
    toast(t("runsPage.toast.runSaved"));
  });

watch(activeRoute, (route) => {
  if (!route) return;
  showManualForm.value = true;
  manualName.value = route.name;
  manualDistanceKm.value = (route.distanceM / 1000).toFixed(2).replace(".", ",");
  manualDate.value = new Date().toISOString().slice(0, 10);
  nextTick(() => minutesInputRef.value?.focus());
});

onMounted(async () => {
  await runsStore.load();
  if (!plannedRouteStore.loaded) await plannedRouteStore.load();
});

function triggerImport() {
  fileInput.value?.click();
}

async function onFileChosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importing.value = true;
  importError.value = null;
  try {
    await runsStore.importFile(file);
    toast(t("runsPage.toast.runImported"));
  } catch (err) {
    importError.value = (err as Error).message;
  } finally {
    importing.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

// Card's "Starten" now matches RoutineList.vue's directness: straight into live GPS tracking
// instead of the manual-entry hand-off (useStartPlannedRoute stays for the other, still-needed
// manual paths — RouteOverviewPage.vue's "Manuell eintragen" and this page's own "Manuell"
// toggle). Reuses RouteOverviewPage.vue's already-correct live-tracking wiring via a query param,
// same deep-link pattern as ProfilePage.vue's `?focus=account-app`, instead of re-deriving
// LiveRunScreen's invocation here.
function startLiveFromCard(route: PlannedRoute) {
  void router.push(`/routes/${route.id}?autostart=live`);
}

function saveManual() {
  void submitManual({ plannedRouteId: activeRoute.value?.id ?? null, elevationGainM: activeRoute.value?.elevationGainM ?? null });
}

// Same two tabs as WorkoutPage.vue's own TabSwitcher — kept as a literal here rather than a
// shared constant since it's just two short { id, label, to } objects, not logic.
const WORKOUT_RUNS_TABS = computed(() => [
  { id: "workout", label: t("common.workout"), to: "/workout" },
  { id: "runs", label: t("workout.tabs.runs"), to: "/runs" },
]);
</script>

<template>
  <BasePage :title="t('nav.runs')">
    <template #subheader>
      <TabSwitcher :tabs="WORKOUT_RUNS_TABS" model-value="runs" :nav-label="t('workout.tabs.navLabel')" />
    </template>

    <div class="pagehead">
      <div>
        <p style="color: var(--dim)">{{ t("runsPage.subtitle") }}</p>
      </div>
      <div class="actions">
        <Button variant="secondary" @click="showManualForm = !showManualForm">{{ t("runsPage.manual") }}</Button>
        <Button :disabled="importing" @click="triggerImport">
          {{ importing ? t("runsPage.importing") : t("runsPage.importGpxFit") }}
        </Button>
        <input ref="fileInput" type="file" accept=".gpx,.fit" style="display: none" @change="onFileChosen" />
      </div>
    </div>

    <p v-if="importError" class="error">{{ importError }}</p>

    <div v-if="activeRoute" class="route-banner panel">
      <span>
        {{ t("runsPage.routeBanner.prefix") }}{{ activeRoute.name }} · {{ (activeRoute.distanceM / 1000).toFixed(2).replace(".", ",") }} km{{
          activeRoute.geometrySource === "straight" ? t("runsPage.routeBanner.approxSuffix") : ""
        }}{{
          activeRoute.elevationGainM != null ? t("runsPage.routeBanner.elevationSuffix", { m: Math.round(activeRoute.elevationGainM) }) : ""
        }}{{ t("runsPage.routeBanner.tail") }}
      </span>
      <button :aria-label="t('runsPage.closeAriaLabel')" @click="dismissRouteBanner">×</button>
    </div>

    <div v-if="showManualForm" class="manual-form panel pop-in">
      <input v-model="manualName" type="text" :placeholder="t('runsPage.namePlaceholder')" :aria-label="t('runsPage.nameAriaLabel')" />
      <input v-model="manualDate" type="date" :aria-label="t('runsPage.dateAriaLabel')" />
      <input v-model="manualDistanceKm" type="text" inputmode="decimal" :placeholder="t('runsPage.distancePlaceholder')" :aria-label="t('runsPage.distanceAriaLabel')" />
      <input
        ref="minutesInputRef"
        v-model="manualMinutes"
        type="text"
        inputmode="decimal"
        :placeholder="t('runsPage.minutesPlaceholder')"
        :aria-label="t('runsPage.minutesAriaLabel')"
      />
      <Button :disabled="submitting" @click="saveManual">{{ t("runsPage.save") }}</Button>
      <p v-if="manualError" class="error">{{ manualError }}</p>
    </div>

    <RouteList
      @edit="openEditRouteWizard"
      @start="startLiveFromCard"
      @create="openNewRouteWizard"
    />
    <RouteWizard
      v-if="showRouteWizard"
      :route="editingRoute"
      :initial-center="initialCenter"
      @close="showRouteWizard = false"
    />
  </BasePage>
</template>

<style scoped>
.pagehead {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp3);
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--sp4);
}
.actions {
  display: flex;
  gap: var(--sp2);
}
.error {
  color: var(--danger);
  margin-top: var(--sp2);
  font-size: 13px;
}
/* Uses the shared .panel/surface-hybrid treatment (tokens.css) instead of sitting flat on the
   page; padding/layout stay local since .panel itself only supplies background/blur/shadow/
   hairline, not spacing. */
.manual-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
  margin-top: var(--sp3);
  margin-bottom: var(--sp4);
  padding: var(--sp4);
  max-width: 560px;
}
.manual-form input {
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13.5px;
}
.route-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  margin-top: var(--sp3);
  margin-bottom: var(--sp4);
  padding: var(--sp3) var(--sp4);
  font-size: 13.5px;
}
.route-banner button {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  line-height: 1;
  padding: 4px;
}
</style>
