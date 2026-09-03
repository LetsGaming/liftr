<script setup lang="ts">
/**
 * Foundation primitive (2026-09-03 Foundation plan, Task 3) — flex + min-width:0 + ellipsis
 * truncation for exercise names and other user/content-controlled strings, closing lens-3's
 * High-severity finding of text wrapping mid-word in an undersized column
 * (audit/plan-c-new-ui-rebuild.md §3 Phase 0, lens-3 §2.2).
 *
 * Deliberately a separate component from tokens.css's `.eyebrow` rule (which also sets
 * `overflow-wrap: break-word`) — that rule solves a different problem: a short, fixed-vocabulary
 * section label ("ERHOLUNGSZONE") that must never overflow its card at extreme zoom, where
 * breaking mid-word is an acceptable last resort. THIS component is for open-ended, potentially
 * long strings (exercise names, routine titles) where a clipped ellipsis reads better than a
 * mid-word break — the two must never be merged into one shared rule, which is exactly the
 * ambiguity this component exists to remove.
 *
 * The parent element supplying this component must itself be a flex or grid container —
 * `min-width: 0` only overrides a flex/grid item's default auto min-width; it does nothing
 * inside a plain block/inline-block parent.
 */
withDefaults(defineProps<{ lines?: number; as?: string }>(), { lines: 1, as: "span" });
</script>

<template>
  <component
    :is="as"
    class="truncating-label"
    :class="{ 'multi-line': lines > 1 }"
    :style="lines > 1 ? { WebkitLineClamp: lines, lineClamp: lines } : undefined"
  >
    <slot />
  </component>
</template>

<style scoped>
.truncating-label {
  display: block;
  min-width: 0;
  overflow: hidden;
}
.truncating-label:not(.multi-line) {
  white-space: nowrap;
  text-overflow: ellipsis;
}
.truncating-label.multi-line {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  white-space: normal;
}
</style>
