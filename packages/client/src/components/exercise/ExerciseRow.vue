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
import TruncatingLabel from "../ui/TruncatingLabel.vue";

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
      <TruncatingLabel as="b" class="ex-name">{{ name }}</TruncatingLabel>
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
/* TruncatingLabel (Foundation primitive, packages/client/src/components/ui/TruncatingLabel.vue)
   supplies the flex + min-width:0 + ellipsis truncation contract itself — .ex-row-meta already
   provides the flex/grid ancestor (flex: 1; min-width: 0 above) that primitive requires. This
   class only carries over the font-size/color that previously lived on `.ex-row-meta b`. */
.ex-name {
  font-size: 13.5px;
  color: var(--text);
}
</style>
