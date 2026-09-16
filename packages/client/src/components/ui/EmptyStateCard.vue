<script setup lang="ts">
/**
 * "Nothing here yet" surface — eyebrow + copy + a primary action. Was hand-rolled twice
 * (RouteList.vue's .route-empty, RoutineList.vue's .routine-empty) with byte-identical layout
 * and near-identical CSS, only the color/width details drifting between the two copies.
 */
withDefaults(defineProps<{ eyebrow: string; eyebrowColor?: string }>(), {
  eyebrowColor: "var(--blue-hi)",
});
</script>

<template>
  <div class="empty-state-card surface-hybrid">
    <div class="eyebrow" :style="{ '--eyebrow-color': eyebrowColor }">{{ eyebrow }}</div>
    <p><slot /></p>
    <slot name="action" />
  </div>
</template>

<style scoped>
.empty-state-card {
  width: 100%;
  max-width: var(--content-w-narrow);
  border-radius: var(--r-xl);
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.empty-state-card p {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
}
</style>
