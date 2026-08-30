<script setup lang="ts">
/**
 * Equipment glyph for an exercise (see lib/equipmentIcons.ts for the source mapping and why
 * it's equipment-keyed, not per-exercise). Static, hand-authored SVG paths only — never user
 * input — so v-html here carries no injection risk, same reasoning as App.vue's nav icons.
 */
import { computed } from "vue";
import { equipmentIconSvg } from "../../lib/equipmentIcons";

const props = withDefaults(defineProps<{ equipment: string; size?: number }>(), { size: 20 });
const svg = computed(() => equipmentIconSvg(props.equipment));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- static, hand-authored SVG paths only, see header comment -->
  <svg class="equipment-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="svg" />
</template>

<style scoped>
.equipment-icon {
  flex: none;
  display: block;
}
</style>
