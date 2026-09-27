<script setup lang="ts">
/**
 * Base card shape for CardGrid.vue's grid: the "workout card" shape (RoutineList.vue's routine
 * cards) generalized so RouteList.vue's route cards render through the exact same markup/CSS
 * instead of a hand-kept-in-sync lookalike. Owns the tap-to-open surface, the head row (optional
 * drag handle, title, optional badge, optional ⋮ menu), the main content slot, an optional meta
 * line, an optional actions row, and an optional footer (RoutineList's inline mesocycle form).
 * Content each list actually differs on (exercise preview vs. map thumbnail, menu items, tier
 * accent) stays local to that list's own component via slots/fallthrough class.
 */
import type { StyleValue } from "vue";

defineProps<{
  title: string;
  dragging?: boolean;
  dragStyle?: StyleValue;
}>();
defineEmits<{ open: [] }>();
</script>

<template>
  <div class="card surface-hybrid" :class="{ dragging }" :style="dragStyle">
    <!-- Stretched-link overlay: the card's single "open" target, first in DOM/tab order so
         keyboard/screen-reader users reach it before the nested controls below. A real <button>
         (not role=button on the card root) gets Enter/Space activation for free and, critically,
         its own accessible name instead of one that swallows every descendant's text. -->
    <button type="button" class="card-open-overlay" :aria-label="title" @click="$emit('open')" />
    <div class="card-head">
      <slot name="drag-handle" />
      <b class="card-name">{{ title }}</b>
      <slot name="badge" />
      <div v-if="$slots.menu" class="card-menu-wrap" @click.stop>
        <slot name="menu" />
      </div>
    </div>
    <div class="card-body"><slot /></div>
    <span v-if="$slots.meta" class="card-meta"><slot name="meta" /></span>
    <div v-if="$slots.actions" class="card-actions" @click.stop>
      <slot name="actions" />
    </div>
    <div v-if="$slots.footer" class="card-footer"><slot name="footer" /></div>
  </div>
</template>
