<script setup lang="ts">
/**
 * Exercise thumbnail/icon + name + metadata, in the horizontal row shape used everywhere an
 * exercise is listed. Was hand-rolled 5 times (ExerciseList's .ex-card, ArrangeStep's
 * .card-head, ReviewStep's .ex-summary li, WorkoutDetail's exercise row) with drifted gaps
 * between near-identical `.ex-meta` blocks. Slot-based rather than a fixed prop list — callers
 * that need extra chrome (a drag handle before it, a remove button after it, a checkmark
 * overlay) wrap this in their own container and use the `meta`/`trailing` slots for anything
 * beyond the name itself.
 */
import ExerciseIcon from "./ExerciseIcon.vue";
import ExerciseThumb from "./ExerciseThumb.vue";

withDefaults(
  defineProps<{ slug: string; equipment: string; name: string; visual?: "thumb" | "icon"; size?: number }>(),
  { visual: "thumb", size: 40 },
);
</script>

<template>
  <div class="exercise-row">
    <ExerciseThumb v-if="visual === 'thumb'" :slug="slug" :equipment="equipment" :size="size" />
    <ExerciseIcon v-else :equipment="equipment" :size="size" />
    <div class="ex-row-meta">
      <b>{{ name }}</b>
      <slot name="meta" />
    </div>
    <slot name="trailing" />
  </div>
</template>

<style scoped>
.exercise-row {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  width: 100%;
  min-width: 0;
}
.ex-row-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ex-row-meta b {
  font-size: 13.5px;
  color: var(--text);
}
</style>
