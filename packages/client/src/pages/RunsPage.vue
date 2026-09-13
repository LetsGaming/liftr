<script setup lang="ts">
// Läufe: mirrors WorkoutPage.vue's flat "start" flow — no sub-tabs, saved routes (RouteList) are
// the page's primary content, same as saved routines are Workout's. Individual-run browsing
// (history, replay, delete) lives on OverviewPage.vue's "Letzte Aktivität" now, not here — that's
// where Workout's own finished-session history lives too, so neither tab duplicates it locally.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { nextTick, onMounted, ref, watch } from "vue";
import RouteList from "../components/route/RouteList.vue";
import RouteWizard from "../components/route-wizard/RouteWizard.vue";
import TabSwitcher from "../components/ui/TabSwitcher.vue";
import { useManualRunEntry } from "../composables/useManualRunEntry";
import { useStartPlannedRoute } from "../composables/useStartPlannedRoute";
import { useToast } from "../composables/useToast";
import { getRunDetail } from "../services/runService";
import type { PlannedRoute } from "../services/plannedRouteService";
import { usePlannedRouteStore } from "../stores/plannedRouteStore";
import { useRunsStore } from "../stores/runsStore";

const runsStore = useRunsStore();
const plannedRouteStore = usePlannedRouteStore();
const { toast } = useToast();

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

const { activeRoute, start: startFromRoute, dismiss: dismissRouteBanner } = useStartPlannedRoute();
const minutesInputRef = ref<HTMLInputElement | null>(null);

const { manualName, manualDate, manualDistanceKm, manualMinutes, manualError, submitting, submitManual } =
  useManualRunEntry(() => {
    showManualForm.value = false;
    manualName.value = "";
    manualDistanceKm.value = "";
    manualMinutes.value = "";
    dismissRouteBanner();
    toast("Lauf gespeichert.");
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
    toast("Lauf importiert.");
  } catch (err) {
    importError.value = (err as Error).message;
  } finally {
    importing.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

function saveManual() {
  void submitManual({ plannedRouteId: activeRoute.value?.id ?? null, elevationGainM: activeRoute.value?.elevationGainM ?? null });
}

// Same two tabs as WorkoutPage.vue's own TabSwitcher — kept as a literal here rather than a
// shared constant since it's just two short { id, label, to } objects, not logic.
const WORKOUT_RUNS_TABS = [
  { id: "workout", label: "Workout", to: "/workout" },
  { id: "runs", label: "Läufe", to: "/runs" },
];
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Läufe</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
    <TabSwitcher :tabs="WORKOUT_RUNS_TABS" model-value="runs" nav-label="Workout oder Läufe" />

    <div class="pagehead">
      <div>
        <p style="color: var(--dim)">Strecke starten oder Lauf manuell erfassen</p>
      </div>
      <div class="actions">
        <button class="btn-secondary" @click="showManualForm = !showManualForm">Manuell</button>
        <button class="btn-primary" :disabled="importing" @click="triggerImport">
          {{ importing ? "Importiere…" : "GPX/FIT importieren" }}
        </button>
        <input ref="fileInput" type="file" accept=".gpx,.fit" style="display: none" @change="onFileChosen" />
      </div>
    </div>

    <p v-if="importError" class="error">{{ importError }}</p>

    <div v-if="activeRoute" class="route-banner panel">
      <span>
        Strecke: {{ activeRoute.name }} · {{ (activeRoute.distanceM / 1000).toFixed(2).replace(".", ",") }} km{{
          activeRoute.geometrySource === "straight" ? " ≈" : ""
        }}{{
          activeRoute.elevationGainM != null ? " · " + Math.round(activeRoute.elevationGainM) + " hm" : ""
        }} — nur noch Dauer eintragen
      </span>
      <button aria-label="Schließen" @click="dismissRouteBanner">×</button>
    </div>

    <div v-if="showManualForm" class="manual-form panel pop-in">
      <input v-model="manualName" type="text" placeholder="Name (optional)" aria-label="Name des Laufs" />
      <input v-model="manualDate" type="date" aria-label="Datum des Laufs" />
      <input v-model="manualDistanceKm" type="text" inputmode="decimal" placeholder="km" aria-label="Distanz in Kilometern" />
      <input
        ref="minutesInputRef"
        v-model="manualMinutes"
        type="text"
        inputmode="decimal"
        placeholder="Minuten"
        aria-label="Dauer in Minuten"
      />
      <button class="btn-primary" :disabled="submitting" @click="saveManual">Speichern</button>
      <p v-if="manualError" class="error">{{ manualError }}</p>
    </div>

    <RouteList
      @edit="openEditRouteWizard"
      @start="(route) => startFromRoute(route)"
      @create="openNewRouteWizard"
    />
    <RouteWizard
      v-if="showRouteWizard"
      :route="editingRoute"
      :initial-center="initialCenter"
      @close="showRouteWizard = false"
    />
    </IonContent>
  </IonPage>
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
