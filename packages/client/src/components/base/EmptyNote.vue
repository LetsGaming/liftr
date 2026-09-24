<script setup lang="ts">
/**
 * One quiet inline line for a section that already has its own chrome (a card, a heading) and
 * just needs to say "nothing here yet". Distinct from patterns/EmptyStateCard.vue, which is a
 * full card with an eyebrow, icon and CTA for when nothing else on screen explains what's missing
 * or what to do about it — reach for that one instead when there's no surrounding context.
 */
withDefaults(defineProps<{ align?: "start" | "center" }>(), { align: "center" });
</script>

<template>
  <p class="empty-note" :class="`align-${align}`"><slot /></p>
</template>

<style scoped>
.empty-note {
  margin: 0;
  color: var(--dim);
  font-size: 12.5px;
}
.align-start {
  text-align: start;
}
.align-center {
  text-align: center;
}
</style>
