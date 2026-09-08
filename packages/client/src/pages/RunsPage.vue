<script setup lang="ts">
// Läufe: GPX import, route map, and run replay built on the stored run_points array — the
// whole point of keeping the full trackpoint array.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import RunReplay from "../components/run/RunReplay.vue";
import RouteList from "../components/route/RouteList.vue";
import RouteWizard from "../components/route-wizard/RouteWizard.vue";
import AppIcon from "../components/ui/AppIcon.vue";
import StatTile from "../components/ui/StatTile.vue";
import WorkoutRunsSwitcher from "../components/ui/WorkoutRunsSwitcher.vue";
import { useConfirmTap } from "../composables/useConfirmTap";
import { useStartPlannedRoute } from "../composables/useStartPlannedRoute";
import { useToast } from "../composables/useToast";
import { isHealthConnectAvailable } from "../health/healthConnect";
import { validateManualEntry } from "../lib/runValidation";
import { getRunDetail } from "../services/runService";
import { getPlannedRouteDetail, type PlannedRoute } from "../services/plannedRouteService";
import { usePlannedRouteStore } from "../stores/plannedRouteStore";
import { useRunsStore, type RunDetail } from "../stores/runsStore";

const runsStore = useRunsStore();
const { toast } = useToast();
const selectedRun = ref<RunDetail | null>(null);
const deleting = ref(false);

// Same archived-route fallback as RunDetail.vue's chip: plannedRouteStore only ever holds active
// (non-archived) routes, so a run referencing a since-deleted route falls back to a direct by-id
// fetch, cached locally here — display-only edge case, not part of the store's active-list state.
const archivedRouteCache = ref<Record<string, string | null>>({});
const selectedRunRouteName = computed(() => {
  const id = selectedRun.value?.plannedRouteId;
  if (!id) return null;
  return plannedRouteStore.byId(id)?.name ?? archivedRouteCache.value[id] ?? null;
});
async function resolveRouteName(id: string) {
  if (plannedRouteStore.byId(id) || archivedRouteCache.value[id] !== undefined) return;
  try {
    archivedRouteCache.value[id] = (await getPlannedRouteDetail(id)).name;
  } catch {
    archivedRouteCache.value[id] = null;
  }
}

const activeSubTab = ref<"verlauf" | "strecken">("verlauf");
const plannedRouteStore = usePlannedRouteStore();
const showRouteWizard = ref(false);
const editingRoute = ref<PlannedRoute | null>(null);
const initialCenter = ref<{ lat: number; lon: number } | undefined>(undefined);

async function openNewRouteWizard() {
  editingRoute.value = null;
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

/** Deletes the selected run, tap-to-confirm. */
const deleteConfirm = useConfirmTap(async () => {
  const id = selectedRun.value?.id;
  if (!id) return;
  deleting.value = true;
  try {
    await runsStore.deleteRun(id);
    selectedRun.value = runsStore.runs.length > 0 ? await runsStore.loadDetail(runsStore.runs[0]!.id) : null;
  } finally {
    deleting.value = false;
  }
});
const importing = ref(false);
const importError = ref<string | null>(null);
const manualError = ref<string | null>(null);
const showManualForm = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const manualName = ref("");
const manualDate = ref(new Date().toISOString().slice(0, 10));
const manualDistanceKm = ref("");
const manualMinutes = ref("");

const { activeRoute, start: startFromRoute, dismiss: dismissRouteBanner } = useStartPlannedRoute();
const minutesInputRef = ref<HTMLInputElement | null>(null);

watch(activeRoute, (route) => {
  if (!route) return;
  activeSubTab.value = "verlauf";
  showManualForm.value = true;
  manualName.value = route.name;
  manualDistanceKm.value = (route.distanceM / 1000).toFixed(2).replace(".", ",");
  manualDate.value = new Date().toISOString().slice(0, 10);
  nextTick(() => minutesInputRef.value?.focus());
});

onMounted(async () => {
  await runsStore.load();
  if (runsStore.runs.length > 0) await selectRun(runsStore.runs[0]!.id);
  if (!plannedRouteStore.loaded) await plannedRouteStore.load();
});

async function selectRun(id: string) {
  selectedRun.value = await runsStore.loadDetail(id);
  if (!plannedRouteStore.loaded) await plannedRouteStore.load();
  const routeId = selectedRun.value?.plannedRouteId;
  if (routeId) await resolveRouteName(routeId);
}

function triggerImport() {
  fileInput.value?.click();
}

async function onFileChosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importing.value = true;
  importError.value = null;
  try {
    const run = await runsStore.importFile(file);
    await selectRun(run.id);
    toast("Lauf importiert.");
  } catch (err) {
    importError.value = (err as Error).message;
  } finally {
    importing.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

async function submitManual() {
  const validationError = validateManualEntry(manualDistanceKm.value, manualMinutes.value, manualDate.value);
  if (validationError) {
    manualError.value = validationError;
    return;
  }
  const km = Number(manualDistanceKm.value.replace(",", "."));
  const min = Number(manualMinutes.value.replace(",", "."));
  try {
    await runsStore.logManual({
      name: manualName.value || null,
      startedAt: new Date(manualDate.value + "T12:00:00").toISOString(),
      distanceM: km * 1000,
      durationS: min * 60,
      plannedRouteId: activeRoute.value?.id ?? null,
      elevationGainM: activeRoute.value?.elevationGainM ?? null,
    });
    manualError.value = null;
    showManualForm.value = false;
    manualName.value = "";
    manualDistanceKm.value = "";
    manualMinutes.value = "";
    dismissRouteBanner();
    if (runsStore.runs.length > 0) await selectRun(runsStore.runs[0]!.id);
    toast("Lauf gespeichert.");
  } catch (err) {
    // Genuine server/network failure only — client-side validation is handled above and never
    // reaches here (validateManualEntry() also guards the new Date(...) call above from ever
    // throwing on a bad manualDate, so this catch only sees real request failures).
    manualError.value = (err as Error).message;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
function formatPace(sPerKm: number | null) {
  if (sPerKm == null) return "–";
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}
function formatDuration(s: number) {
  const m = Math.round(s / 60);
  return `${m} min`;
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Läufe</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
    <WorkoutRunsSwitcher active="runs" />
    <div class="sub-switcher">
      <button class="wr-pill" :class="{ 'wr-active': activeSubTab === 'verlauf' }" @click="activeSubTab = 'verlauf'">
        Verlauf
      </button>
      <button class="wr-pill" :class="{ 'wr-active': activeSubTab === 'strecken' }" @click="activeSubTab = 'strecken'">
        Strecken
      </button>
    </div>

    <template v-if="activeSubTab === 'verlauf'">
    <div class="pagehead">
      <div>
        <p style="color: var(--dim)">Als Datei importiert · deine Daten, kein Drittanbieter-Konto</p>
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
      <button class="btn-primary" @click="submitManual">Speichern</button>
      <p v-if="manualError" class="error">{{ manualError }}</p>
    </div>

    <!-- No import button in this empty state: the .pagehead button above is the only one that's
         always present (it's the sole import entry point once runs exist), so duplicating it
         here would just be two identically-labeled "GPX/FIT importieren" buttons on screen. -->
    <section v-if="runsStore.loaded && runsStore.runs.length === 0" class="runs-empty panel">
      <div class="eyebrow">Läufe</div>
      <p>
        Noch keine Läufe erfasst. Importiere eine GPX- oder FIT-Datei aus deiner Uhr oder App, oder trage einen Lauf
        manuell nach — oben rechts.
      </p>
      <p v-if="isHealthConnectAvailable()">
        Läufe mit Route werden auf Android automatisch über Health Connect importiert, sobald du das in deinem Profil
        einmalig verbindest.
      </p>
    </section>

    <div v-else class="layout">
      <div class="main-col">
        <template v-if="selectedRun">
          <RunReplay v-if="selectedRun.points.length > 0" :points="selectedRun.points" />
          <p v-else style="color: var(--dim)">Manuell erfasster Lauf — keine Route verfügbar.</p>
          <div v-if="selectedRunRouteName" class="route-chip">
            Strecke: {{ selectedRunRouteName }}
          </div>
          <div class="stats">
            <StatTile :value="`${(selectedRun.distanceM / 1000).toFixed(2)} km`" label="Distanz" />
            <StatTile :value="formatDuration(selectedRun.durationS)" label="Dauer" />
            <StatTile :value="formatPace(selectedRun.avgPaceSPerKm)" label="Pace ø" />
            <StatTile :value="selectedRun.avgHr != null ? Math.round(selectedRun.avgHr) + ' bpm' : '–'" label="Puls ø" />
            <StatTile
              v-if="selectedRun.elevationGainM != null"
              :value="Math.round(selectedRun.elevationGainM) + ' hm'"
              label="Höhenmeter"
            />
          </div>
          <button
            class="btn-secondary delete-run-btn"
            :class="{ confirming: deleteConfirm.isArmed() }"
            :disabled="deleting"
            @click="deleteConfirm.trigger()"
          >
            <template v-if="deleting">Wird gelöscht…</template>
            <template v-else-if="deleteConfirm.isArmed()">Wirklich löschen?</template>
            <template v-else><AppIcon name="trash" /> Lauf löschen</template>
          </button>
        </template>
      </div>

      <div class="run-list">
        <h3>Verlauf</h3>
        <button
          v-for="run in runsStore.runs"
          :key="run.id"
          class="run-row panel"
          :class="{ active: selectedRun?.id === run.id }"
          @click="selectRun(run.id)"
        >
          <div class="meta">
            <b>{{ run.name ?? "Lauf" }}</b>
            <span>{{ formatDate(run.startedAt) }} · {{ (run.distanceM / 1000).toFixed(1) }} km</span>
          </div>
          <div class="pace tnum">{{ formatPace(run.avgPaceSPerKm) }}</div>
        </button>
      </div>
    </div>
    </template>

    <template v-if="activeSubTab === 'strecken'">
      <button class="btn-primary btn-block" @click="openNewRouteWizard">+ Neue Strecke</button>
      <RouteList @edit="openEditRouteWizard" @start="(route) => { activeSubTab = 'verlauf'; startFromRoute(route); }" />
      <RouteWizard
        v-if="showRouteWizard"
        :route="editingRoute"
        :initial-center="initialCenter"
        @saved="showRouteWizard = false"
      />
    </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Mirrors WorkoutRunsSwitcher.vue's own .wr-switcher/.wr-pill shape (scoped styles don't cross
   SFC boundaries, so the class names are shared by convention but the rules are duplicated
   here) — this switches between Verlauf (run history) and Strecken (planned routes) within the
   /runs page itself, one level below the Workout/Läufe switcher above it. */
.sub-switcher {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  margin-bottom: var(--sp4);
}
.sub-switcher .wr-pill {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  text-align: center;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: none;
  border: none;
  color: var(--dim);
  font-weight: 700;
  font-size: 13.5px;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.sub-switcher .wr-pill.wr-active {
  background: var(--blue);
  color: var(--bg);
}
.pagehead {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp3);
  justify-content: space-between;
  align-items: flex-start;
}
.actions {
  display: flex;
  gap: var(--sp2);
}
.error {
  color: var(--red);
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
/* Rides .panel (hybrid bg/blur/shadow/hairline). border-radius stays --r-xl (larger than
   .panel's default --r-lg) to preserve this empty state's deliberately roomier look; .panel's
   own background/box-shadow/backdrop-filter declarations are otherwise reused as-is. */
.runs-empty {
  border-radius: var(--r-xl);
  padding: var(--sp5);
  margin-top: var(--sp4);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp4);
  /* Fills the viewport instead of sitting as a short card with a large empty scroll area below
     it. Same reasoning as WorkoutPage.vue's .not-started fix. */
  min-height: 40vh;
}
.runs-empty p {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
}
.layout {
  display: flex;
  flex-direction: column;
  gap: var(--sp5);
  margin-top: var(--sp5);
}
/* Same cramped-4-across fix as OverviewPage's .status-strip: 2x2 on mobile, widening to
   4-across only once there's room (>=560px). */
.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp2);
  margin-top: var(--sp3);
}
.stats :deep(.stat-tile b) {
  font-size: clamp(14px, 4.2vw, 20px);
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  line-height: 1.15;
}
@media (min-width: 560px) {
  .stats {
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  }
}
.route-chip {
  display: inline-block;
  margin-top: var(--sp2);
  padding: 4px 10px;
  border-radius: var(--r-full, 999px);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 700;
}
.route-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  margin-top: var(--sp3);
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
.delete-run-btn {
  margin-top: var(--sp4);
  color: var(--red);
}
.delete-run-btn.confirming {
  background: var(--red-lo);
  border-color: var(--red);
  color: var(--text);
}
.run-list h3 {
  font-size: 15px;
  margin-bottom: var(--sp3);
}
/* Rides .panel (hybrid bg/blur/shadow + gradient hairline edge via ::after). Per tokens.css's
   .panel/.surface-hybrid comment, a native <button> needs its own explicit background (which
   .panel already sets) rather than relying on the pseudo-element alone — this button already
   gets that from the .panel class in the template. There's no real border here, just the
   hairline gradient, so "active" and "hover" are expressed as an inset ring / brightness tweak
   layered on top of .panel's own box-shadow instead of swapping backgrounds, which would break
   translucency. */
.run-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp3);
  color: var(--text);
  margin-bottom: var(--sp2);
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), filter var(--dur-fast) var(--ease-out);
  /* --ease-out, not --ease-spring: the overshoot easing is reserved for earned moments
     (rank-up, PR, level-up) per motion.css's own convention — a run-list row entrance isn't
     one of those. */
  animation: pop-in var(--dur-base) var(--ease-out) both;
}
.run-row:active {
  transform: scale(0.98);
}
@media (hover: hover) {
  .run-row:not(.active):hover {
    filter: brightness(1.12);
  }
}
.run-row.active {
  box-shadow: var(--surface-hybrid-shadow), inset 0 0 0 2px var(--blue);
}
.run-row .meta {
  display: flex;
  flex-direction: column;
}
.run-row .meta span {
  font-size: 12px;
  color: var(--faint);
}
.run-row .pace {
  font-size: 13px;
  color: var(--dim);
}

@media (min-width: 900px) {
  .layout {
    flex-direction: row;
    align-items: flex-start;
    max-width: var(--content-w-xwide);
    margin-left: auto;
    margin-right: auto;
  }
  .main-col {
    flex: 1.4;
  }
  .run-list {
    flex: 1;
    max-width: 340px;
  }
}
</style>
