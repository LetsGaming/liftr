<script setup lang="ts">
/**
 * Diagnostics page — "It should NEVER be needed for a user to go there, but it could make things
 * easier in the future, especially for power-users." Reached only via a link (ProfilePage.vue's
 * Diagnose sub-section, or a sync toast's onClick) — never required by any normal flow, same
 * "reachable, not surfaced" pattern AttributionsPage.vue already follows for /attributions.
 *
 * Two sections:
 * 1. Synchronisierung — every user, not owner-gated. The client-side Health Connect sync log
 *    (syncLog.ts) — a skipped workout never reaches the server, so this is the only place its
 *    outcome is recorded at all.
 * 2. Serverfehler — the previous owner-only list from ProfilePage.vue, moved here unchanged.
 */
import { onMounted, ref } from "vue";
import BasePage from "../components/ui/BasePage.vue";
import { getMe, getRecentErrors, type ErrorLogEntry, type Me } from "../services/authService";
import {
  importNewHealthConnectWorkouts,
  resetHealthConnectScanWindow,
  waitForInFlightHealthConnectImport,
  type HealthConnectSkipReason,
} from "../health/healthConnect";
import { refreshCardioDerivedStores } from "../composables/useCardioDerivedStores";
import { clearSyncLog, readSyncLog, type SyncLogEntry } from "../lib/syncLog";
import { useToast } from "../composables/useToast";
import { useConfirmTap } from "../composables/useConfirmTap";

const me = ref<Me | null>(null);
const syncLog = ref<SyncLogEntry[]>([]);
const expandedEntry = ref<number | null>(null); // index into syncLog, one report open at a time
const rawDataOpen = ref(new Set<string>()); // workoutId set, per-row "Rohdaten anzeigen" toggle
const rescanBusy = ref<30 | 90 | null>(null);

const errorLogs = ref<ErrorLogEntry[]>([]);
const errorLogsOpen = ref(false);
const errorLogsLoading = ref(false);

const { toast } = useToast();

function refreshSyncLog() {
  syncLog.value = readSyncLog();
}

const { trigger: triggerClearLog, isArmed: isClearLogArmed } = useConfirmTap(() => {
  clearSyncLog();
  refreshSyncLog();
});

onMounted(async () => {
  refreshSyncLog();
  me.value = await getMe();
});

function toggleEntry(idx: number) {
  expandedEntry.value = expandedEntry.value === idx ? null : idx;
}

function toggleRawData(workoutId: string) {
  if (rawDataOpen.value.has(workoutId)) rawDataOpen.value.delete(workoutId);
  else rawDataOpen.value.add(workoutId);
}

async function toggleErrorLogs() {
  errorLogsOpen.value = !errorLogsOpen.value;
  if (errorLogsOpen.value && errorLogs.value.length === 0) {
    errorLogsLoading.value = true;
    try {
      errorLogs.value = await getRecentErrors();
    } finally {
      errorLogsLoading.value = false;
    }
  }
}

async function rescan(daysBack: 30 | 90) {
  rescanBusy.value = daysBack;
  try {
    // A resume-triggered import (e.g. the app briefly backgrounding) may already be running and
    // have captured the *old* scan window before this call started — waiting it out first means
    // resetHealthConnectScanWindow below can never be undone by that other run's own
    // setLastCheck(), which would otherwise consume the widened window before this rescan sees it.
    await waitForInFlightHealthConnectImport();
    resetHealthConnectScanWindow(daysBack);
    const result = await importNewHealthConnectWorkouts("manual");
    refreshSyncLog();
    if (result.imported > 0) refreshCardioDerivedStores();
    if (result.imported === 0 && result.skipped === 0 && result.failed === 0) {
      toast(`Letzte ${daysBack} Tage geprüft — keine neuen Aktivitäten gefunden.`);
    } else {
      const parts = [`${result.imported} importiert`];
      if (result.skipped > 0) parts.push(`${result.skipped} übersprungen`);
      if (result.failed > 0) parts.push(`${result.failed} fehlgeschlagen`);
      toast(`Letzte ${daysBack} Tage geprüft — ${parts.join(", ")}.`);
    }
  } finally {
    rescanBusy.value = null;
  }
}

const SKIP_REASON_LABEL: Record<HealthConnectSkipReason, string> = {
  route_consent_required: "Health Connect hat die Strecke nicht freigegeben",
  route_missing: "keine Streckendaten von Health Connect erhalten",
  no_usable_data: "keine verwertbaren Daten für dieses Workout",
  invalid_points: "alle Streckenpunkte waren ungültig",
};

const ACTIVITY_LABEL: Record<string, string> = {
  RUNNING: "Laufen",
  RUNNING_TREADMILL: "Laufen (Laufband)",
  WALKING: "Gehen",
  HIKING: "Wandern",
};

function activityLabel(rawWorkoutType: string): string {
  return ACTIVITY_LABEL[rawWorkoutType.toUpperCase()] ?? rawWorkoutType;
}

function workoutSummary(w: SyncLogEntry["result"]["workouts"][number]): string {
  const km = w.distanceM != null ? `${(w.distanceM / 1000).toFixed(1)} km` : null;
  const label = [activityLabel(w.rawWorkoutType), km].filter(Boolean).join(", ");
  if (w.outcome.kind === "imported") return `${label} — importiert`;
  if (w.outcome.kind === "skipped") return `${label} — übersprungen: ${SKIP_REASON_LABEL[w.outcome.reason]}`;
  return `${label} — fehlgeschlagen: ${w.outcome.message}`;
}

function copyReport(entry: SyncLogEntry) {
  void navigator.clipboard?.writeText(JSON.stringify(entry, null, 2)).then(
    () => toast("Bericht kopiert."),
    () => toast("Kopieren fehlgeschlagen."),
  );
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE");
}
</script>

<template>
  <BasePage title="Diagnose" back-button>
    <div class="diagnostics-content">
      <section class="card card--quiet surface-hybrid">
        <h2 class="eyebrow">Synchronisierung</h2>
        <p class="hint">
          Jeder Health-Connect-Abgleich — auch übersprungene Workouts, die nie bei Liftr ankommen, damit du siehst,
          warum.
        </p>

        <div class="rescan-row">
          <button class="btn-secondary" :disabled="rescanBusy !== null" @click="rescan(30)">
            {{ rescanBusy === 30 ? "Prüfe…" : "Letzte 30 Tage erneut prüfen" }}
          </button>
          <button class="btn-secondary" :disabled="rescanBusy !== null" @click="rescan(90)">
            {{ rescanBusy === 90 ? "Prüfe…" : "Letzte 90 Tage erneut prüfen" }}
          </button>
        </div>

        <p v-if="syncLog.length === 0" class="current" style="color: var(--faint)">
          Noch keine Synchronisierung aufgezeichnet.
        </p>

        <button
          v-else
          type="button"
          class="btn-secondary danger"
          :class="{ confirming: isClearLogArmed() }"
          @click="triggerClearLog()"
        >
          {{ isClearLogArmed() ? "Wirklich leeren?" : "Protokoll leeren" }}
        </button>

        <ul v-if="syncLog.length > 0" class="sync-log-list">
          <li v-for="(entry, idx) in syncLog" :key="entry.at" class="sync-log-entry surface-hybrid">
            <button type="button" class="sync-log-head" :aria-expanded="expandedEntry === idx" @click="toggleEntry(idx)">
              <span class="sync-log-meta">
                <span class="tnum">{{ formatAt(entry.at) }}</span>
                <span class="sync-log-trigger">{{ entry.trigger === "manual" ? "manuell" : "App-Start" }}</span>
              </span>
              <span class="sync-log-counts">
                <span v-if="entry.result.imported > 0">{{ entry.result.imported }} importiert</span>
                <span v-if="entry.result.skipped > 0">{{ entry.result.skipped }} übersprungen</span>
                <span v-if="entry.result.failed > 0" class="error">{{ entry.result.failed }} fehlgeschlagen</span>
                <span v-if="entry.result.imported === 0 && entry.result.skipped === 0 && entry.result.failed === 0">
                  keine Aktivitäten
                </span>
              </span>
            </button>

            <div v-if="expandedEntry === idx" class="sync-log-body">
              <p v-if="entry.result.workouts.length === 0" class="hint">Keine Workouts in diesem Zeitraum.</p>
              <div v-for="w in entry.result.workouts" :key="w.workoutId" class="sync-workout-row">
                <p
                  class="sync-workout-summary"
                  :class="{ 'is-error': w.outcome.kind === 'failed', 'is-skip': w.outcome.kind === 'skipped' }"
                >
                  {{ workoutSummary(w) }}
                </p>
                <button type="button" class="raw-toggle" @click="toggleRawData(w.workoutId)">
                  {{ rawDataOpen.has(w.workoutId) ? "Rohdaten ausblenden" : "Rohdaten anzeigen" }}
                </button>
                <pre v-if="rawDataOpen.has(w.workoutId)" class="raw-data">{{ JSON.stringify(w, null, 2) }}</pre>
              </div>
              <button type="button" class="btn-secondary copy-btn" @click="copyReport(entry)">Bericht kopieren</button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="me?.role === 'owner'" class="card card--quiet surface-hybrid">
        <h2 class="eyebrow">Serverfehler</h2>
        <p class="hint">Die letzten unerwarteten Serverfehler — hilfreich, falls mal etwas nicht funktioniert.</p>
        <button class="btn-secondary btn-block" @click="toggleErrorLogs">
          {{ errorLogsOpen ? "Ausblenden" : "Fehler anzeigen" }}
        </button>
        <div v-if="errorLogsOpen" class="error-log-list">
          <p v-if="errorLogsLoading" class="current">Wird geladen…</p>
          <p v-else-if="errorLogs.length === 0" class="current" style="color: var(--faint)">
            Keine Fehler aufgezeichnet.
          </p>
          <div v-for="entry in errorLogs" :key="entry.id" class="error-log-row">
            <div class="error-log-meta">
              <span class="tnum">{{ new Date(entry.occurredAt).toLocaleString("de-DE") }}</span>
              <span>{{ entry.method }} {{ entry.url }}</span>
            </div>
            <div class="error-log-message">{{ entry.message }}</div>
          </div>
        </div>
      </section>
    </div>
  </BasePage>
</template>

<style scoped>
.diagnostics-content {
  max-width: var(--content-w-narrow);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.rescan-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
  margin: var(--sp3) 0;
}
/* Same armed-confirm-tap treatment as ProfilePage.vue's "Konto löschen" button — duplicated here
   since Vue's scoped styles don't cross component boundaries. */
.btn-secondary.danger {
  color: var(--danger);
  margin-bottom: var(--sp3);
}
.btn-secondary.danger.confirming {
  background: var(--danger-lo);
  color: var(--text);
  font-weight: 700;
}
.sync-log-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  margin-top: var(--sp3);
}
.sync-log-entry {
  border-radius: var(--r-lg);
  overflow: hidden;
}
.sync-log-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp2);
  padding: var(--sp3) var(--sp4);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.sync-log-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--faint);
}
.sync-log-trigger {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.sync-log-counts {
  display: flex;
  gap: var(--sp2);
  font-size: 12.5px;
  color: var(--dim);
  flex-wrap: wrap;
  justify-content: flex-end;
}
.sync-log-counts .error {
  color: var(--danger);
}
.sync-log-body {
  padding: 0 var(--sp4) var(--sp3);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.sync-workout-row {
  padding: var(--sp2) 0;
  border-top: 1px solid var(--line-2);
}
.sync-workout-summary {
  font-size: 13px;
}
.sync-workout-summary.is-skip {
  color: var(--dim);
}
.sync-workout-summary.is-error {
  color: var(--danger);
}
.raw-toggle {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  padding: 2px 0;
  cursor: pointer;
}
.raw-data {
  font-size: 11px;
  background: var(--surface-3);
  padding: var(--sp2);
  border-radius: var(--r-md);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.copy-btn {
  align-self: flex-start;
  margin-top: var(--sp2);
}
.error-log-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  margin-top: var(--sp3);
}
.error-log-row {
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line-2);
}
.error-log-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--sp2);
  font-size: 12px;
  color: var(--faint);
}
.error-log-message {
  margin-top: 4px;
  font-size: 13px;
  color: var(--danger);
  word-break: break-word;
}
</style>
