<script setup lang="ts">
/**
 * Auto-starts after each logged set (plan 1.5). Purely a UI timer — not persisted to
 * IndexedDB, since losing a rest countdown on a crash is a minor annoyance, not lost data.
 * Fires a Notification when it hits zero, if permission was granted.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { formatClock } from "../../lib/format";
import { isNative } from "../../lib/platform";

const { t } = useI18n();

async function fireRestOverNotification() {
  const title = t("workoutUi.restTimer.notificationTitle");
  const body = t("workoutUi.restTimer.notificationBody");
  if (isNative()) {
    await LocalNotifications.schedule({
      notifications: [{ id: Date.now() % 2147483647, title, body }],
    });
  } else if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

// `restKind` discriminates why `trigger` fired: 'between-sets' and 'after-exercise' both render
// the normal ring+countdown+skip state; 'superset-continue' renders a distinct compact
// "acknowledged, move on" state with no ring/countdown/skip, since there is genuinely nothing to
// count down mid-superset (logCurrentSet() returned null — round not yet complete, no rest).
const props = defineProps<{
  trigger: number;
  seconds?: number;
  restKind: "between-sets" | "after-exercise" | "superset-continue";
}>();
// RestTimer is one persistent instance for the whole workout, so `currentTotal` must be a ref
// re-read fresh on every start() rather than a plain const captured once from props.seconds —
// otherwise moving to an exercise with a different configured rest duration ("adjust the pause,
// per set and per exercise") would silently have no effect. Keeping it in a ref also lets
// progressPercent's denominator stay correct.
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
</script>

<template>
  <div v-if="restKind === 'superset-continue'" class="rest-timer rest-timer-continue surface-hybrid">
    <div class="meta">
      <b>{{ t("workoutUi.restTimer.continueSuperset") }}</b>
      <span>{{ t("workoutUi.restTimer.noRestNote") }}</span>
    </div>
  </div>
  <div v-else class="rest-timer surface-hybrid">
    <div class="ring" :class="{ 'ring-done': justFinished }" :style="{ '--p': progressPercent() + '%' }">
      <i class="tnum">{{ running ? formatClock(Math.max(left, 0)) : formatClock(props.seconds ?? 90) }}</i>
    </div>
    <div class="meta">
      <b>{{ t("workoutUi.restTimer.pauseLabel") }}</b>
      <span>{{ running ? t("workoutUi.restTimer.running") : t("workoutUi.restTimer.waitingToStart") }}</span>
    </div>
    <button class="skip-btn surface-hybrid" @click="stop">{{ t("workoutUi.restTimer.skip") }}</button>
  </div>
</template>

<style scoped>
/* This is the one surface visible in every state of the logging loop (idle / running /
   just-finished / superset-continue), so it uses .surface-hybrid (translucent + blurred
   background, gradient hairline edge via ::after) rather than a flat fill + border, matching
   every other card/panel on this screen. */
.rest-timer {
  display: flex;
  align-items: center;
  gap: var(--sp3);
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
  /* Same var(--tier-accent, var(--blue-hi)) fallback convention as App.vue's nav indicator and
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
/* Deliberately NOT converted to a translucent hybrid fill — this is the countdown digit
   readout itself (a live numeric value the lifter reads mid-rest), and it sits inside the
   already-translucent .surface-hybrid card above it. Stacking a second layer of translucency
   directly behind the one number on this screen someone is actively timing their next set
   against would risk exactly the legibility regression the redesign spec calls out avoiding —
   kept as the opaque --surface fill on purpose. */
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
/* Compact "acknowledged, move on" state — lower visual weight than the ring+countdown states
   (no ring, no skip button, smaller vertical footprint) so it reads as distinct rather than as
   a stripped-down/broken timer. */
.rest-timer-continue {
  padding: var(--sp2) var(--sp4);
  opacity: 0.85;
}
.rest-timer-continue .meta span {
  color: var(--faint);
}
/* .surface-hybrid, same as .rest-timer above. */
.skip-btn {
  padding: 9px 14px;
  font-size: 13px;
  border-radius: var(--r-sm);
  color: var(--text);
}
</style>
