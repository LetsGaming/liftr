<script setup lang="ts">
/**
 * Active-run screen for phone-GPS live tracking (useLiveRun.ts) — the live-tracking counterpart
 * to RunsPage.vue's manual-entry form. Opened from RunsPage.vue when the user picks "Live
 * tracken" (either freeform or off a planned route's quick-start hand-off); finishing here
 * submits straight to runsStore.submitLiveRun instead of the manual form.
 */
import { computed, onMounted, ref } from "vue";
import SheetModal from "../ui/SheetModal.vue";
import AppIcon from "../ui/AppIcon.vue";
import LiveRunMap from "./LiveRunMap.vue";
import Chip from "../base/Chip.vue";
import Button from "../base/Button.vue";
import IconButton from "../patterns/IconButton.vue";
import { useLiveRun } from "../../composables/useLiveRun";
import { useRunsStore } from "../../stores/runsStore";
import { useToast } from "../../composables/useToast";
import { formatClockLong, formatPace } from "../../lib/format";
import type { PlannedRoute } from "../../services/plannedRouteService";
import type { RunSummary } from "../../services/runService";

const props = defineProps<{
  route?: PlannedRoute | null;
  initialCenter?: { lat: number; lon: number };
}>();
const emit = defineEmits<{ finished: [run: RunSummary]; close: [] }>();

const runsStore = useRunsStore();
const { toast } = useToast();
const live = useLiveRun();

/** Visible inline confirm card, not a silent tap-twice-on-the-close-icon pattern — same reasoning
 *  as WorkoutPage.vue's "Workout abbrechen" confirm: discarding an in-progress run is destructive
 *  and unrecoverable, so it needs an explicit dialog the user can't trigger by accident. */
const showDiscardConfirm = ref(false);
function confirmDiscard() {
  showDiscardConfirm.value = false;
  void live.discard();
  emit("close");
}

onMounted(() => {
  void live.start();
});

function requestClose() {
  // Tracking hasn't produced anything worth losing yet, or it's already finished — just leave.
  if (live.status.value === "idle" || live.status.value === "finished" || live.points.value.length === 0) {
    void live.discard();
    emit("close");
    return;
  }
  showDiscardConfirm.value = true;
}

// SheetModal's own native dismiss (backdrop tap, swipe, hardware back) can't be intercepted with
// a confirm-tap the way the header's own close button can — same limitation RouteWizard.vue's
// `@close="emit('close')"` already accepts for its own SheetModal. Cleanup still has to run
// either way, so this at least guarantees the GPS watch is cleared before the component
// unmounts, even though this path skips the "are you sure" step the header button gets.
function handleNativeClose() {
  void live.discard();
  emit("close");
}

const submitting = ref(false);
async function finishRun() {
  const result = await live.finish();
  if (result.points.length === 0) {
    // Nothing was ever recorded (e.g. GPS never got a fix) — nothing to submit, just leave.
    emit("close");
    return;
  }
  submitting.value = true;
  try {
    const run = await runsStore.submitLiveRun({
      clientId: crypto.randomUUID(),
      name: props.route?.name ?? null,
      points: result.points,
    });
    toast("Lauf gespeichert.");
    emit("finished", run);
  } catch {
    toast("Speichern fehlgeschlagen — der Lauf bleibt auf diesem Gerät, bis du es erneut versuchst.");
  } finally {
    submitting.value = false;
  }
}

const distanceKm = computed(() => (live.distanceM.value / 1000).toFixed(2));
</script>

<template>
  <SheetModal :sheet="false" fill-body background="var(--bg)" @close="handleNativeClose">
    <template #header>
      <header class="live-head">
        <div class="live-head-title">
          <b>{{ route ? route.name : "Freier Lauf" }}</b>
          <Chip v-if="live.status.value === 'paused'" class="status-chip" size="sm">Pausiert</Chip>
        </div>
        <IconButton icon="close" label="Schließen" variant="close" class="close-btn" @click="requestClose" />
      </header>
    </template>

    <div v-if="showDiscardConfirm" class="discard-confirm panel">
      <p>Lauf wirklich verwerfen? Der bisherige Fortschritt geht verloren.</p>
      <div class="discard-confirm-actions">
        <Button variant="secondary" @click="showDiscardConfirm = false">Nein</Button>
        <button class="btn-cancel-confirm" @click="confirmDiscard">Ja, verwerfen</button>
      </div>
    </div>

    <p v-if="live.error.value" class="gps-error">{{ live.error.value }}</p>

    <LiveRunMap class="live-map" :points="live.points.value" :initial-center="initialCenter" />

    <div class="hud">
      <div class="hud-stat">
        <span class="eyebrow">Distanz</span>
        <b class="tnum">{{ distanceKm }} km</b>
      </div>
      <div class="hud-stat">
        <span class="eyebrow">Zeit</span>
        <b class="tnum">{{ formatClockLong(live.elapsedS.value) }}</b>
      </div>
      <div class="hud-stat">
        <span class="eyebrow">Tempo</span>
        <b class="tnum">{{ formatPace(live.paceSPerKm.value) }}</b>
      </div>
    </div>

    <footer class="live-foot">
      <Button v-if="live.status.value === 'tracking'" variant="secondary" block @click="live.pause()">
        <template #leading><AppIcon name="pause" /></template>
        Pause
      </Button>
      <Button v-else-if="live.status.value === 'paused'" variant="secondary" block @click="live.resume()">
        <template #leading><AppIcon name="play" /></template>
        Weiter
      </Button>
      <Button variant="primary" block :disabled="submitting || live.status.value === 'idle'" @click="finishRun">
        <template v-if="submitting">Speichert…</template>
        <template v-else>Lauf beenden</template>
      </Button>
    </footer>
  </SheetModal>
</template>

<style scoped>
.live-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  padding: 10px 12px;
  /* Full-bleed modal header (see SheetModal.vue) — without this the run title/close button sit
     under the notch/status bar on Android during an active run. */
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
}
.live-head-title {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
/* Same visible-confirm-card treatment as WorkoutPage.vue's .cancel-confirm — .panel (tokens.css)
   supplies background/border/radius. */
.discard-confirm {
  margin: 0 12px;
  padding: var(--sp4);
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.discard-confirm p {
  font-size: 13.5px;
  color: var(--text);
}
.discard-confirm-actions {
  display: flex;
  gap: var(--sp2);
}
.discard-confirm-actions button {
  flex: 1;
}
.btn-cancel-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  min-height: var(--touch-target-min);
  border-radius: var(--r-md);
  background: var(--danger);
  border: 1px solid var(--danger);
  color: var(--k-failure-text);
  font-size: 13.5px;
  font-weight: 700;
}
.gps-error {
  margin: 0 12px;
  padding: var(--sp3);
  border-radius: var(--r-md);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 13px;
}
.live-map {
  flex: 1;
  min-height: 0;
}
.hud {
  display: flex;
  justify-content: space-around;
  padding: var(--sp4);
  gap: var(--sp3);
}
.hud-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.hud-stat b {
  font-size: 1.4rem;
}
.live-foot {
  display: flex;
  gap: var(--sp3);
  padding: 10px 12px;
  border-top: 1px solid var(--line);
}
</style>
