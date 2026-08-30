<script setup lang="ts">
/** Desktop-only clickable exercise list with done/active states (plan 1.5, mockup .wk-exlist). */
import { useActiveWorkoutStore, type ActiveExercise } from "../../stores/activeWorkoutStore";

const store = useActiveWorkoutStore();

/** The rail used to show only "2 / 4 Sätze" — a set count with no rep target at all, so you
 *  couldn't tell 3×5 from 3×15 without switching to that exercise. Reps can vary per set
 *  (warm-up ramp, drop sets), so this shows the first working (non-warmup) set's rep target
 *  as the representative number, not a claim that every set matches it exactly. */
function workingReps(ex: ActiveExercise): number | null {
  return ex.sets.find((s) => !s.isWarmup)?.reps ?? null;
}
</script>

<template>
  <div class="exercise-rail">
    <button
      v-for="(ex, i) in store.exercises"
      :key="ex.workoutExerciseId"
      class="rail-item"
      :class="{ active: i === store.currentExerciseIndex, done: ex.sets.every((s) => s.logged), grouped: ex.supersetGroup != null }"
      @click="store.jumpToExercise(i)"
    >
      <span class="n">{{ ex.sets.every((s) => s.logged) ? "✓" : i + 1 }}</span>
      <span class="meta">
        <b>{{ ex.name }}</b>
        <span>
          {{ ex.sets.filter((s) => s.logged).length }} / {{ ex.sets.length }} Sätze
          <template v-if="workingReps(ex) !== null"> · {{ workingReps(ex) }} Wdh.</template>
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.exercise-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rail-item {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-md);
  text-align: left;
  /* Every row is a real dark surface, always — state is expressed by accent (active fill,
     done dimming), never by flipping to a lighter background. A bare native <button> falls
     back to the browser's own light chrome if you don't set this explicitly, which is exactly
     the bug this replaced: every upcoming/idle row rendered on a near-white default button
     background with default-black text, while only .active had a background at all. */
  background: var(--surface-2);
  color: var(--dim);
  transition: background var(--dur-base) var(--ease-out);
}
.rail-item .meta b {
  color: var(--dim);
}
.rail-item.active {
  background: var(--surface-3);
  color: var(--text);
}
.rail-item.active .meta b {
  color: var(--text);
}
/* Was opacity:0.65 — fading a whole row (including its now-more-readable --faint text and
   the green done-check) reads as "disabled," and it's not; it's finished. Express "done" with
   color instead, same rule as the exercise-rail white-card fix: state via accent, not by
   knocking down contrast on the surface itself. */
.rail-item.done {
  color: var(--faint);
}
.rail-item.done .meta b {
  color: var(--faint);
}
.rail-item.grouped {
  border-left: 3px solid var(--blue-hi);
}
.rail-item .n {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface-3);
  font-size: 12px;
  font-weight: 800;
  flex: none;
}
.rail-item.done .n {
  background: var(--green);
  color: #04120a;
  /* Draws in rather than snapping (engagement rework W3) — an exercise going from "3/4" to a
     green check is the row's own small reward moment. */
  animation: pop-in var(--dur-base) var(--ease-spring) both;
}
.rail-item .meta {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}
.rail-item .meta span {
  color: var(--faint);
  font-size: 11.5px;
}
</style>
