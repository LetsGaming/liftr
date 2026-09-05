<script setup lang="ts">
/** Clickable exercise list with done/active states (plan 1.5, mockup .wk-exlist).
 *  Despite this file's former "desktop-only" framing, none of this component's own CSS was ever
 *  gated behind a viewport media query — WorkoutPage.vue's mobile layout already rendered this
 *  as a full vertical list (identical markup to desktop), just stacked above the focus column
 *  with no responsive treatment. `variant="horizontal"` (Task 6) is the actual mobile-parity fix:
 *  a compact scroll-snap strip so the rail doesn't push the current exercise below the fold on
 *  narrow viewports. Desktop keeps the default vertical variant unchanged. */
import { useActiveWorkoutStore, type ActiveExercise } from "../../stores/activeWorkoutStore";

withDefaults(defineProps<{ variant?: "vertical" | "horizontal" }>(), { variant: "vertical" });
/** Wave 0-B W4: emitted alongside store.jumpToExercise(i) so a caller rendering this rail inside
 *  a dismissible sheet (WorkoutPage.vue's exercise-overview sheet, replacing the old always-on
 *  horizontal strip) can close itself once a jump happens, without this component needing to
 *  know anything about sheets. */
const emit = defineEmits<{ jump: [index: number] }>();

const store = useActiveWorkoutStore();

function jump(i: number) {
  store.jumpToExercise(i);
  emit("jump", i);
}

/** The rail used to show only "2 / 4 Sätze" — a set count with no rep target at all, so you
 *  couldn't tell 3×5 from 3×15 without switching to that exercise. Reps can vary per set
 *  (warm-up ramp, drop sets), so this shows the first working (non-warmup) set's rep target
 *  as the representative number, not a claim that every set matches it exactly. */
function workingReps(ex: ActiveExercise): number | null {
  return ex.sets.find((s) => !s.isWarmup)?.reps ?? null;
}
</script>

<template>
  <div class="exercise-rail" :class="{ horizontal: variant === 'horizontal' }">
    <button
      v-for="(ex, i) in store.exercises"
      :key="ex.workoutExerciseId"
      class="rail-item"
      :class="{ active: i === store.currentExerciseIndex, done: ex.sets.every((s) => s.logged), grouped: ex.supersetGroup != null }"
      @click="jump(i)"
    >
      <span class="n">{{ ex.sets.every((s) => s.logged) ? "✓" : i + 1 }}</span>
      <span class="meta">
        <b><span v-if="ex.supersetGroup != null" class="superset-dot" aria-hidden="true" />{{ ex.name }}</b>
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
/* Was `border-left: 3px solid var(--blue-hi)` — a full-height colored bar is the loudest
   possible encoding of a quiet grouping fact (superset membership), and reads as a card-level
   alert rather than a label (craft-floor: no colored border-left/right above 1px on list items).
   A small inline dot next to the exercise name instead. */
.superset-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--blue-hi);
  margin-right: 6px;
  vertical-align: middle;
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

/* Mobile jump-to-exercise parity (Task 6): same buttons, same store.jumpToExercise(i) handler,
   same active/done/superset states — only the container's flex-direction and item sizing change,
   so this reuses the template/logic above rather than duplicating the component. A horizontal
   scroll-snap strip keeps the rail reachable without the vertical list's full-height cost on
   narrow viewports (which otherwise pushes the focus column below the fold). */
.exercise-rail.horizontal {
  flex-direction: row;
  gap: var(--sp2);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  /* Let the strip bleed to the viewport edge on mobile without clipping the touch targets'
     focus/active states above/below it. */
  padding: 2px;
  -webkit-overflow-scrolling: touch;
}
.exercise-rail.horizontal .rail-item {
  flex: none;
  scroll-snap-align: start;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp2);
  /* Touch-target floor (WCAG 2.5.5 / Apple HIG 44pt) — same token used across the app's other
     interactive controls (see tokens.css --touch-target-min). */
  min-width: 116px;
  min-height: var(--touch-target-min);
}
.exercise-rail.horizontal .rail-item .meta {
  max-width: 100px;
}
.exercise-rail.horizontal .rail-item .meta b,
.exercise-rail.horizontal .rail-item .meta span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
