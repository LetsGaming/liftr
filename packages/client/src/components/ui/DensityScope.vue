<script setup lang="ts">
/**
 * Foundation primitive (2026-09-03 Foundation plan, Task 5) — wraps a screen (or a section of
 * one) in a density mode, setting `data-density` so tokens.css's `[data-density="..."]` rules
 * (Task 1) cascade `--density-gap`/`--density-touch-min`/`--density-text-scale` to every
 * descendant, and calling `provideDensityMode` (composables/useDensity.ts) so descendants can
 * also branch in JS via `useDensityMode()`. `display: contents` keeps this element itself out of
 * layout — it exists purely to carry the attribute/provide, not to introduce an extra box.
 */
import { provideDensityMode, type DensityMode } from "../../composables/useDensity";

const props = defineProps<{ mode: DensityMode }>();
provideDensityMode(props.mode);
</script>

<template>
  <div class="density-scope" :data-density="mode">
    <slot />
  </div>
</template>

<style scoped>
.density-scope {
  display: contents;
}
</style>
