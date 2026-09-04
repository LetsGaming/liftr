<script setup lang="ts">
/**
 * Auto-starts after each logged set (plan 1.5). Purely a UI timer — not persisted to
 * IndexedDB, since losing a rest countdown on a crash is a minor annoyance, not lost data.
 * Fires a Notification when it hits zero, if permission was granted.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { onBeforeUnmount, ref, watch } from "vue";

async function fireRestOverNotification() {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [{ id: Date.now() % 2147483647, title: "Pause vorbei", body: "Zeit für den nächsten Satz." }],
    });
  } else if (Notification.permission === "granted") {
    new Notification("Pause vorbei", { body: "Zeit für den nächsten Satz." });
  }
}

// Task 3 (three distinct rest states): `restKind` discriminates why `trigger` fired. Defaults to
// 'between-sets' for backward compatibility with any caller that doesn't pass it (pre-Task-3
// behaviour — ring+countdown+skip). 'superset-continue' renders a distinct compact
// "acknowledged, move on" state with no ring/countdown/skip, since there is genuinely nothing to
// count down mid-superset (logCurrentSet() returned null — round not yet complete, no rest).
const props = defineProps<{
  trigger: number;
  seconds?: number;
  restKind?: "between-sets" | "after-exercise" | "superset-continue";
}>();
// `total` used to be a plain const captured once from props.seconds at setup — since RestTimer
// is one persistent instance for the whole workout, a later change to the `seconds` prop (e.g.
// moving to an exercise with a different configured rest duration, feedback: "adjust the pause,
// per set and per exercise") silently had no effect. Re-read the prop fresh on every start()
// instead, into a ref so progressPercent's denominator stays correct too.
const currentTotal = ref(props.seconds ?? 90);
const left = ref(currentTotal.value);
const running = ref(false);
// Fires a one-shot pulse class on the ring at zero (engagement rework W3) — a still ring at
// 00:00 reads as "stopped/broken", a pulse reads as "time's up".
const justFinished = ref(false);
let interval: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (interval) clearInterval(interval);
  interval = null;
  running.value = false;
}

function start() {
  stop();
  currentTotal.value = props.seconds ?? 90;
  left.value = currentTotal.value;
  running.value = true;
  justFinished.value = false;
  interval = setInterval(() => {
    left.value -= 1;
    if (left.value <= 0) {
      stop();
      justFinished.value = true;
      void fireRestOverNotification();
    }
  }, 1000);
}

watch(
  () => props.trigger,
  (v) => {
    if (v <= 0) return;
    // 'superset-continue' has no rest to count down (logCurrentSet() returned null) — stop any
    // in-flight ring instead of starting a new countdown, so the template's third state renders
    // cleanly instead of a stale ring sitting mid-fill underneath it.
    if (props.restKind === "superset-continue") {
      stop();
      return;
    }
    start();
  },
);

onBeforeUnmount(stop);

const progressPercent = () => Math.round((1 - Math.max(left.value, 0) / currentTotal.value) * 100);

function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
</script>

<template>
  <!-- Task 3: third distinct rest state — mid-superset, no rest coming. No ring (nothing to
       count down), no skip button (nothing to skip). Compact, "acknowledged, move on", not a
       broken-looking timer. -->
  <div v-if="restKind === 'superset-continue'" class="rest-timer rest-timer-continue">
    <div class="meta">
      <b>Weiter im Superset</b>
      <span>keine Pause</span>
    </div>
  </div>
  <div v-else class="rest-timer">
    <div class="ring" :class="{ 'ring-done': justFinished }" :style="{ '--p': progressPercent() + '%' }">
      <i class="tnum">{{ running ? formatSeconds(Math.max(left, 0)) : formatSeconds(props.seconds ?? 90) }}</i>
    </div>
    <div class="meta">
      <b>Pause</b>
      <span>{{ running ? "läuft…" : "startet nach dem Satz" }}</span>
    </div>
    <button class="skip-btn" @click="stop">Überspringen</button>
  </div>
</template>

<style scoped>
.rest-timer {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--sp3) var(--sp4);
}
/* @property registers --p as an animatable <percentage>, so the conic-gradient sweeps
   continuously (engagement rework W3) instead of the 1s-step jump a plain custom property
   gives a browser no interpolation model for. Falls back to the old step behaviour on any
   engine that doesn't support @property — still correct, just not smooth. */
@property --p {
  syntax: "<percentage>";
  inherits: true;
  initial-value: 0%;
}
.ring {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  /* engagement-audit-v4 Phase 2B critique fix: was a flat --blue-hi regardless of tier — same
     var(--tier-accent, var(--blue-hi)) fallback convention as App.vue's nav indicator and
     log-set focus ring, so the ring picks up the user's rank tier where one is in scope. */
  background: conic-gradient(var(--tier-accent, var(--blue-hi)) var(--p, 0%), var(--surface-3) 0);
  flex: none;
  transition: --p var(--dur-base) linear;
}
.ring-done {
  animation: ring-pulse var(--dur-cele) var(--ease-spring) 1;
}
@keyframes ring-pulse {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}
.ring i {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--surface);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
}
.meta {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.meta span {
  font-size: 12px;
  color: var(--faint);
}
/* Task 3: compact "acknowledged, move on" state — lower visual weight than the ring+countdown
   states (no ring, no skip button, smaller vertical footprint) so it reads as distinct rather
   than as a stripped-down/broken timer. */
.rest-timer-continue {
  padding: var(--sp2) var(--sp4);
  opacity: 0.85;
}
.rest-timer-continue .meta span {
  color: var(--faint);
}
.skip-btn {
  padding: 9px 14px;
  font-size: 13px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
}
</style>
