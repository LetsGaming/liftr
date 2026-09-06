<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import AppIcon from "../ui/AppIcon.vue";
import { useActiveWorkoutStore } from "../../stores/activeWorkoutStore";

const store = useActiveWorkoutStore();
const display = ref("00:00");
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Deliberately does NOT read `store.elapsedSeconds` — that's a Pinia getter (a Vue `computed`
 * under the hood), memoized against its reactive dependencies (startedAt/pausedAt/
 * totalPausedMs). `Date.now()` inside it isn't a tracked dependency, so the memoized value only
 * actually changes when one of those fields does — i.e. on pause/resume — not once a second.
 * The visible symptom: the clock looked frozen and only "caught up" after pausing and
 * resuming. Reading the raw state fields here and computing fresh each tick sidesteps the
 * memoization entirely.
 */
function paint() {
  if (!store.startedAt) {
    display.value = "00:00";
    return;
  }
  const end = store.pausedAt ?? Date.now();
  const s = Math.floor((end - store.startedAt - store.totalPausedMs) / 1000);
  display.value = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

onMounted(() => {
  paint();
  timer = setInterval(paint, 1000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="workout-clock">
    <div class="clock-time">
      <small>Trainingszeit</small>
      <span class="tnum">{{ display }}</span>
    </div>
    <!-- Row of same-family controls: pause/resume plus whatever the caller slots in next to it
         (WorkoutPage.vue puts the cancel-workout confirm-tap button here — product owner
         report: cancel used to live far down the rail, disconnected from the clock it acts on,
         reading as an unrelated control rather than "same family, different action"). -->
    <div class="clock-actions">
      <button class="icon-btn surface-hybrid" :aria-label="store.isPaused ? 'Fortsetzen' : 'Pausieren'" @click="store.togglePause()">
        <AppIcon :name="store.isPaused ? 'play' : 'pause'" />
      </button>
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.workout-clock {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  justify-content: space-between;
}
.clock-actions {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.clock-time {
  display: flex;
  flex-direction: column;
}
.clock-time small {
  color: var(--faint);
  font-size: 11px;
}
.clock-time span {
  font-size: 22px;
  font-weight: 800;
}
/* N2: was a flat --surface-2 fill — .surface-hybrid instead (see WorkoutPage.vue's .next-ex-row
   comment for the general rationale). */
.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
  color: var(--text);
  font-size: 16px;
}
</style>
