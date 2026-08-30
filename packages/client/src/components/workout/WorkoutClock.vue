<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
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
    <button class="icon-btn" :aria-label="store.isPaused ? 'Fortsetzen' : 'Pausieren'" @click="store.togglePause()">
      {{ store.isPaused ? "▶" : "⏸" }}
    </button>
  </div>
</template>

<style scoped>
.workout-clock {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  justify-content: space-between;
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
.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
}
</style>
