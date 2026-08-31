<script setup lang="ts">
// Läufe (plan Phase 4 / mockup #p-laeufe): GPX import, route map, and run replay built on the
// stored run_points array — the whole point of keeping the full trackpoint array (audit §5).
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import RunReplay from "../components/run/RunReplay.vue";
import StatTile from "../components/ui/StatTile.vue";
import { useConfirmTap } from "../composables/useConfirmTap";
import { useRunsStore, type RunDetail } from "../stores/runsStore";

const runsStore = useRunsStore();
const selectedRun = ref<RunDetail | null>(null);
const deleting = ref(false);

/** Feedback: "not possible to delete past runs". */
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
const showManualForm = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const manualName = ref("");
const manualDate = ref(new Date().toISOString().slice(0, 10));
const manualDistanceKm = ref("");
const manualMinutes = ref("");

onMounted(async () => {
  await runsStore.load();
  if (runsStore.runs.length > 0) await selectRun(runsStore.runs[0]!.id);
});

async function selectRun(id: string) {
  selectedRun.value = await runsStore.loadDetail(id);
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
  } catch (err) {
    importError.value = (err as Error).message;
  } finally {
    importing.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

const canSubmitManual = computed(() => {
  const km = Number(manualDistanceKm.value.replace(",", "."));
  const min = Number(manualMinutes.value.replace(",", "."));
  return km > 0 && min > 0;
});

async function submitManual() {
  if (!canSubmitManual.value) return;
  const km = Number(manualDistanceKm.value.replace(",", "."));
  const min = Number(manualMinutes.value.replace(",", "."));
  await runsStore.logManual({
    name: manualName.value || null,
    startedAt: new Date(manualDate.value + "T12:00:00").toISOString(),
    distanceM: km * 1000,
    durationS: min * 60,
  });
  showManualForm.value = false;
  manualName.value = "";
  manualDistanceKm.value = "";
  manualMinutes.value = "";
  if (runsStore.runs.length > 0) await selectRun(runsStore.runs[0]!.id);
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

    <div v-if="showManualForm" class="manual-form pop-in">
      <input v-model="manualName" type="text" placeholder="Name (optional)" aria-label="Name des Laufs" />
      <input v-model="manualDate" type="date" aria-label="Datum des Laufs" />
      <input v-model="manualDistanceKm" type="text" inputmode="decimal" placeholder="km" aria-label="Distanz in Kilometern" />
      <input v-model="manualMinutes" type="text" inputmode="decimal" placeholder="Minuten" aria-label="Dauer in Minuten" />
      <button class="btn-primary" :disabled="!canSubmitManual" @click="submitManual">Speichern</button>
    </div>

    <section v-if="runsStore.loaded && runsStore.runs.length === 0" class="runs-empty">
      <div class="eyebrow">Läufe</div>
      <p>
        Noch keine Läufe erfasst. Importiere eine GPX- oder FIT-Datei aus deiner Uhr oder App, oder trage einen Lauf
        manuell nach — deine Daten bleiben lokal, kein Drittanbieter-Konto nötig.
      </p>
      <button class="btn-primary btn-block" :disabled="importing" @click="triggerImport">
        {{ importing ? "Importiere…" : "GPX/FIT importieren" }}
      </button>
    </section>

    <div v-else class="layout">
      <div class="main-col">
        <template v-if="selectedRun">
          <RunReplay v-if="selectedRun.points.length > 0" :points="selectedRun.points" />
          <p v-else style="color: var(--dim)">Manuell erfasster Lauf — keine Route verfügbar.</p>
          <div class="stats">
            <StatTile :value="`${(selectedRun.distanceM / 1000).toFixed(2)} km`" label="Distanz" />
            <StatTile :value="formatDuration(selectedRun.durationS)" label="Dauer" />
            <StatTile :value="formatPace(selectedRun.avgPaceSPerKm)" label="Pace ø" />
            <StatTile :value="selectedRun.avgHr != null ? Math.round(selectedRun.avgHr) + ' bpm' : '–'" label="Puls ø" />
          </div>
          <button
            class="btn-secondary delete-run-btn"
            :class="{ confirming: deleteConfirm.isArmed() }"
            :disabled="deleting"
            @click="deleteConfirm.trigger()"
          >
            {{ deleting ? "Wird gelöscht…" : deleteConfirm.isArmed() ? "Wirklich löschen?" : "🗑 Lauf löschen" }}
          </button>
        </template>
      </div>

      <div class="run-list">
        <h3>Verlauf</h3>
        <button
          v-for="run in runsStore.runs"
          :key="run.id"
          class="run-row"
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
.manual-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
  margin-top: var(--sp3);
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
.runs-empty {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  padding: var(--sp5);
  margin-top: var(--sp4);
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
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
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp2);
  margin-top: var(--sp3);
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
.run-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp3);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  margin-bottom: var(--sp2);
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-base) var(--ease-out), background var(--dur-fast) var(--ease-out);
  /* --ease-out, not --ease-spring: the overshoot easing is reserved for earned moments
     (rank-up, PR, level-up) per motion.css's own convention — a run-list row entrance isn't
     one of those (see commit 8c0f158 for the same fix elsewhere). */
  animation: pop-in var(--dur-base) var(--ease-out) both;
}
.run-row:active {
  transform: scale(0.98);
}
@media (hover: hover) {
  .run-row:not(.active):hover {
    background: var(--surface-3);
  }
}
.run-row.active {
  border-color: var(--blue);
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
